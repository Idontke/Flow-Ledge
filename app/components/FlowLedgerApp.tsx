"use client";

import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

type View = "overview" | "ledger" | "assets" | "plan";
type TxKind = "expense" | "income" | "transfer" | "investment";
type AccountGroup = "cash" | "investment" | "liability";
type MoneyCurrency = "CNY" | "USD" | "USDT" | "JPY" | "HKD" | "EUR" | "GBP" | "CAD";

type Account = {
  id: number;
  name: string;
  group: AccountGroup;
  balance: number;
  currency: string;
  assetType?: "manual" | "crypto";
  assetId?: string | null;
  assetSymbol?: string | null;
  costBasisCny?: number;
  realizedPnlCny?: number;
  color: string;
  short: string;
  archived?: boolean;
  archivedAt?: string | null;
};

type Transaction = {
  id: number;
  title: string;
  category: string;
  amount: number;
  currency: MoneyCurrency;
  kind: TxKind;
  accountId: number;
  targetAccountId: number | null;
  sourceDelta: number;
  targetAmount: number | null;
  targetCurrency: MoneyCurrency | null;
  feeAmount: number;
  feeCurrency: MoneyCurrency | null;
  baseAmountCny: number;
  fxRate?: string | null;
  fxSource?: string | null;
  fxCapturedAt?: string | null;
  occurredAt: string;
};

type CryptoKind = "buy" | "sell" | "deposit" | "withdrawal" | "transfer";
type CryptoTransaction = {
  id: number;
  accountId: number;
  targetAccountId: number | null;
  fundingAccountId: number | null;
  kind: CryptoKind;
  quantity: number;
  amount: number;
  currency: MoneyCurrency;
  feeAmount: number;
  baseAmountCny: number;
  fxRate?: string | null;
  fxSource?: string | null;
  fxCapturedAt?: string | null;
  occurredAt: string;
  note: string;
};

type CategoryBudget = { id: number; category: string; amount: number };
type RecurringBill = { id: number; title: string; category: string; amount: number; currency: MoneyCurrency; dueDay: number; accountId: number | null; active: boolean; frequency?: "monthly" | "yearly"; nextDueDate?: string | null; trialEndsAt?: string | null };
type PlanDraft = { key: string; category: string; amount: string };
type TrashItem = { type: "account" | "transaction" | "crypto" | "bill"; id: number; title: string; detail: string; deletedAt: string };
type DisplayUnit = "CNY" | "USD" | "USDT";
type CalculatorOperator = "+" | "−" | "×" | "÷";
type ToastTone = "success" | "error";
type ToastMessage = { message: string; tone: ToastTone };
type ApiErrorPayload = { error?: string; code?: string };
type MarketData = {
  rates: Record<MoneyCurrency, number>;
  quotes: Record<string, { cny: number; usd: number; usdt: number; change24h: number; lastUpdatedAt: number }>;
  fetchedAt: string;
  sources: { crypto: string; fx: string };
  stale?: boolean;
  estimatedFx?: boolean;
  missing?: string[];
  error?: string;
};

type LedgerPayload = {
  accounts: Account[];
  transactions: Transaction[];
  cryptoTransactions: CryptoTransaction[];
  monthlyBudget: number;
  savingsTarget: number;
  categoryBudgets: CategoryBudget[];
  recurringBills: RecurringBill[];
  trashItems: TrashItem[];
  error?: string;
};

type TransactionHistoryPayload = {
  transactions: Transaction[];
  total: number;
  hasMore: boolean;
  error?: string;
};

type IconName = "grid" | "list" | "wallet" | "target" | "plus" | "eye" | "eyeOff" | "arrowUp" | "arrowDown" | "chevron" | "sparkle" | "close" | "search" | "calendar" | "arrowRight" | "check";

const navItems: Array<{ id: View; label: string; icon: IconName }> = [
  { id: "overview", label: "概览", icon: "grid" },
  { id: "ledger", label: "明细", icon: "list" },
  { id: "assets", label: "资产", icon: "wallet" },
  { id: "plan", label: "计划", icon: "target" },
];

const kindMeta: Record<TxKind, { label: string; sign: string; tone: string; icon: string }> = {
  expense: { label: "支出", sign: "−", tone: "mint", icon: "支" },
  income: { label: "收入", sign: "+", tone: "lime", icon: "入" },
  transfer: { label: "转账", sign: "", tone: "blue", icon: "转" },
  investment: { label: "投资", sign: "", tone: "violet", icon: "投" },
};

const cryptoKindMeta: Record<CryptoKind, { label: string; sign: string }> = {
  buy: { label: "买入", sign: "+" }, sell: { label: "卖出", sign: "−" }, deposit: { label: "转入", sign: "+" }, withdrawal: { label: "转出", sign: "−" }, transfer: { label: "账户互转", sign: "→" },
};

const accountColors = [
  "#213547", "#475569", "#5e6f62", "#0f766e",
  "#18aa72", "#65a30d", "#b18a39", "#df8e36",
  "#ea580c", "#ec6f5e", "#dc2626", "#be185d",
  "#7656d8", "#4f46e5", "#247ce7", "#0891b2",
];
const money = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cryptoAssets = [
  ["bitcoin", "BTC", "Bitcoin"], ["ethereum", "ETH", "Ethereum"], ["solana", "SOL", "Solana"], ["litecoin", "LTC", "Litecoin"],
  ["tether", "USDT", "Tether"], ["binancecoin", "BNB", "BNB"], ["ripple", "XRP", "XRP"], ["dogecoin", "DOGE", "Dogecoin"],
  ["cardano", "ADA", "Cardano"], ["avalanche-2", "AVAX", "Avalanche"], ["polkadot", "DOT", "Polkadot"], ["chainlink", "LINK", "Chainlink"], ["tron", "TRX", "TRON"],
] as const;
const unitSymbols: Record<MoneyCurrency, string> = { CNY: "¥", USD: "$", USDT: "₮", JPY: "¥", HKD: "HK$", EUR: "€", GBP: "£", CAD: "C$" };
const HISTORY_PAGE_SIZE = 10;
const moneyCurrencies: Array<{ code: MoneyCurrency; label: string }> = [
  { code: "CNY", label: "CNY · 人民币" }, { code: "USD", label: "USD · 美元" }, { code: "USDT", label: "USDT · 泰达币" }, { code: "JPY", label: "JPY · 日元" },
  { code: "HKD", label: "HKD · 港币" }, { code: "EUR", label: "EUR · 欧元" }, { code: "GBP", label: "GBP · 英镑" }, { code: "CAD", label: "CAD · 加元" },
];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    wallet: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 7h14.5A2.5 2.5 0 0 1 21 9.5V14h-5a2 2 0 0 1 0-4h5" /></>,
    target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><path d="m15.5 8.5 4-4M16 4.5h3.5V8" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    eyeOff: <><path d="m3 3 18 18" /><path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a14.8 14.8 0 0 1-2.1 2.8M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6a9.6 9.6 0 0 0 3.3-.6" /></>,
    arrowUp: <path d="m18 15-6-6-6 6" />,
    arrowDown: <path d="m6 9 6 6 6-6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    sparkle: <><path d="m12 3 1.3 4.2L17.5 8.5l-4.2 1.3L12 14l-1.3-4.2-4.2-1.3 4.2-1.3z" /><path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
    arrowRight: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function sameMonth(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "今天";
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function toLocalInput(iso?: string | null) {
  const date = iso ? new Date(iso) : new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatCalculatorValue(value: number) {
  if (!Number.isFinite(value)) return "错误";
  const rounded = Number(value.toPrecision(12));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function calculateValues(left: number, right: number, operator: CalculatorOperator) {
  if (operator === "+") return left + right;
  if (operator === "−") return left - right;
  if (operator === "×") return left * right;
  return right === 0 ? Number.NaN : left / right;
}

async function fetchReadJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { signal, cache: "no-store" });
    const data = await response.json() as T & ApiErrorPayload;
    if (response.ok) return data;
    const canRetry = response.status === 503 && data.code === "D1_BUSY" && attempt === 0;
    if (!canRetry) throw new Error(data.error || "请求失败");
    await new Promise((resolve) => window.setTimeout(resolve, 850 + Math.random() * 350));
    if (signal?.aborted) throw new DOMException("请求已取消", "AbortError");
  }
  throw new Error("请求失败");
}

export default function FlowLedgerApp() {
  const [view, setView] = useState<View>("overview");
  const [hidden, setHidden] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cryptoTransactions, setCryptoTransactions] = useState<CryptoTransaction[]>([]);
  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [savingsTarget, setSavingsTarget] = useState(0);
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const ledgerLoadRef = useRef<Promise<void> | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | TxKind>("all");
  const [historyTransactions, setHistoryTransactions] = useState<Transaction[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionDeleteConfirm, setTransactionDeleteConfirm] = useState(false);
  const [kind, setKind] = useState<TxKind>("expense");
  const [sourceId, setSourceId] = useState(0);
  const [transactionCurrency, setTransactionCurrency] = useState<MoneyCurrency>("CNY");
  const [targetId, setTargetId] = useState(0);
  const [transactionPreset, setTransactionPreset] = useState<{ title: string; amount: number; category: string; currency: MoneyCurrency; accountId: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [accountAssetType, setAccountAssetType] = useState<"manual" | "crypto">("manual");
  const [selectedCryptoId, setSelectedCryptoId] = useState("bitcoin");
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>("CNY");
  const [market, setMarket] = useState<MarketData | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");

  const [cryptoOpen, setCryptoOpen] = useState(false);
  const [editingCrypto, setEditingCrypto] = useState<CryptoTransaction | null>(null);
  const [cryptoKind, setCryptoKind] = useState<CryptoKind>("buy");
  const [cryptoAccountId, setCryptoAccountId] = useState(0);
  const [cryptoTargetId, setCryptoTargetId] = useState(0);
  const [cryptoFundingId, setCryptoFundingId] = useState(0);
  const [cryptoCurrency, setCryptoCurrency] = useState<MoneyCurrency>("CNY");
  const [cryptoSaving, setCryptoSaving] = useState(false);
  const [cryptoDeleteConfirm, setCryptoDeleteConfirm] = useState(false);

  const [planOpen, setPlanOpen] = useState(false);
  const [planBudgetDraft, setPlanBudgetDraft] = useState("");
  const [planSavingsDraft, setPlanSavingsDraft] = useState("");
  const [planCategoriesDraft, setPlanCategoriesDraft] = useState<PlanDraft[]>([]);
  const [planSaving, setPlanSaving] = useState(false);

  const [billOpen, setBillOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null);
  const [billSaving, setBillSaving] = useState(false);
  const [billDeleteConfirm, setBillDeleteConfirm] = useState(false);
  const [billCurrency, setBillCurrency] = useState<MoneyCurrency>("CNY");
  const [dataOpen, setDataOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorValue, setCalculatorValue] = useState("0");
  const [calculatorStored, setCalculatorStored] = useState<number | null>(null);
  const [calculatorOperator, setCalculatorOperator] = useState<CalculatorOperator | null>(null);
  const [calculatorOverwrite, setCalculatorOverwrite] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [trashBusy, setTrashBusy] = useState("");

  const applyPayload = useCallback((data: LedgerPayload) => {
    setAccounts(data.accounts ?? []);
    setTransactions(data.transactions ?? []);
    setCryptoTransactions(data.cryptoTransactions ?? []);
    setMonthlyBudget(data.monthlyBudget ?? 0);
    setSavingsTarget(data.savingsTarget ?? 0);
    setCategoryBudgets(data.categoryBudgets ?? []);
    setRecurringBills(data.recurringBills ?? []);
    setTrashItems(data.trashItems ?? []);
    setHistoryVersion((value) => value + 1);
  }, []);

  const refreshLedger = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    let request = ledgerLoadRef.current;
    try {
      if (!request) {
        request = (async () => {
          const data = await fetchReadJson<LedgerPayload>("/api/ledger");
          applyPayload(data);
          setSyncError("");
        })();
        ledgerLoadRef.current = request;
      }
      await request;
    } catch {
      setSyncError("账本暂时无法同步，请稍后刷新重试。");
    } finally {
      if (request && ledgerLoadRef.current === request) ledgerLoadRef.current = null;
      if (showLoading) setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    let secondFrame = 0;
    let loadTimer = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        loadTimer = window.setTimeout(() => void refreshLedger(true), 0);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(loadTimer);
    };
  }, [refreshLedger]);

  const refreshMarket = useCallback(async () => {
    const ids = Array.from(new Set(accounts.filter((account) => account.assetType === "crypto" && account.assetId).map((account) => account.assetId as string)));
    setMarketLoading(true);
    try {
      const response = await fetch(`/api/market-data?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
      const data = await response.json() as MarketData;
      if (!response.ok) throw new Error(data.error || "行情同步失败");
      setMarket(data); setMarketError("");
    } catch (error) { setMarketError(error instanceof Error ? error.message : "行情同步失败"); }
    finally { setMarketLoading(false); }
  }, [accounts]);

  useEffect(() => {
    if (loading) return;
    const initial = window.setTimeout(() => void refreshMarket(), 650);
    const timer = window.setInterval(() => void refreshMarket(), 60_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [loading, refreshMarket]);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const activeAccounts = useMemo(() => accounts.filter((account) => !account.archived), [accounts]);
  const archivedAccounts = useMemo(() => accounts.filter((account) => account.archived), [accounts]);
  const convertMoney = useCallback((value: number, from: MoneyCurrency, to: MoneyCurrency) => {
    if (from === to) return value;
    if (!market?.rates?.[from] || !market.rates[to]) return Number.NaN;
    return value * market.rates[from] / market.rates[to];
  }, [market]);
  const toCny = useCallback((value: number, currency: MoneyCurrency) => convertMoney(value, currency, "CNY"), [convertMoney]);
  const accountValue = useCallback((account: Account) => {
    if (account.assetType === "crypto") {
      const quote = account.assetId ? market?.quotes[account.assetId] : null;
      return quote ? account.balance * quote[displayUnit.toLowerCase() as "cny" | "usd" | "usdt"] : Number.NaN;
    }
    if (account.currency === displayUnit) return account.balance;
    if (!market?.rates?.[account.currency as MoneyCurrency] || !market.rates[displayUnit]) return Number.NaN;
    const cnyValue = account.balance * market.rates[account.currency as MoneyCurrency];
    return cnyValue / market.rates[displayUnit];
  }, [displayUnit, market]);
  const valued = useCallback((account: Account) => { const value = accountValue(account); return Number.isFinite(value) ? value : 0; }, [accountValue]);
  const valuationMissing = useMemo(() => activeAccounts.filter((account) => !Number.isFinite(accountValue(account))).length, [activeAccounts, accountValue]);
  const netWorth = useMemo(() => activeAccounts.reduce((sum, account) => sum + (account.group === "liability" ? -valued(account) : valued(account)), 0), [activeAccounts, valued]);
  const assetTotal = useMemo(() => activeAccounts.filter((account) => account.group !== "liability").reduce((sum, account) => sum + valued(account), 0), [activeAccounts, valued]);
  const liabilityTotal = useMemo(() => activeAccounts.filter((account) => account.group === "liability").reduce((sum, account) => sum + valued(account), 0), [activeAccounts, valued]);
  const cashTotal = useMemo(() => activeAccounts.filter((account) => account.group === "cash").reduce((sum, account) => sum + valued(account), 0), [activeAccounts, valued]);
  const investmentTotal = useMemo(() => activeAccounts.filter((account) => account.group === "investment").reduce((sum, account) => sum + valued(account), 0), [activeAccounts, valued]);
  const monthTransactions = useMemo(() => transactions.filter((tx) => sameMonth(tx.occurredAt)), [transactions]);
  const historicalCny = useCallback((tx: Transaction) => tx.baseAmountCny > 0 ? tx.baseAmountCny : (toCny(tx.amount, tx.currency || "CNY") || 0), [toCny]);
  const monthIncome = useMemo(() => monthTransactions.filter((tx) => tx.kind === "income").reduce((sum, tx) => sum + historicalCny(tx), 0), [monthTransactions, historicalCny]);
  const monthExpense = useMemo(() => monthTransactions.filter((tx) => tx.kind === "expense").reduce((sum, tx) => sum + historicalCny(tx), 0), [monthTransactions, historicalCny]);
  const savings = monthIncome - monthExpense;
  const budgetUsed = monthlyBudget > 0 ? Math.min(100, monthExpense / monthlyBudget * 100) : 0;
  const investmentShare = assetTotal > 0 ? investmentTotal / assetTotal * 100 : 0;
  const now = new Date();
  const monthName = `${now.getMonth() + 1}月`;
  const dateText = `${monthName}${now.getDate()}日 · ${["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][now.getDay()]}`;
  const displayMoney = (value: number) => hidden ? "••••••" : `${unitSymbols[displayUnit]}${money.format(convertMoney(value, "CNY", displayUnit) || 0)} ${displayUnit}`;
  const displayFlowMoney = (value: number, currency: MoneyCurrency) => hidden ? "••••••" : `${unitSymbols[displayUnit]}${money.format(convertMoney(value, currency, displayUnit) || 0)} ${displayUnit}`;
  const displayHistoricalMoney = (tx: Transaction) => hidden ? "••••••" : `${unitSymbols[displayUnit]}${money.format(convertMoney(historicalCny(tx), "CNY", displayUnit) || 0)} ${displayUnit}`;
  const originalMoney = (value: number, currency: MoneyCurrency) => `${unitSymbols[currency]}${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: currency === "JPY" ? 0 : 2, maximumFractionDigits: currency === "JPY" ? 0 : 2 }).format(value)} ${currency}`;
  const displayAssetMoney = (value: number) => hidden ? "••••••" : `${unitSymbols[displayUnit]}${money.format(value)} ${displayUnit}`;

  useEffect(() => {
    const usable = activeAccounts.filter((account) => account.assetType !== "crypto");
    if (!usable.some((account) => account.id === sourceId)) {
      const timer = window.setTimeout(() => setSourceId(usable[0]?.id ?? 0), 0);
      return () => window.clearTimeout(timer);
    }
  }, [activeAccounts, sourceId]);

  const allocation = useMemo(() => {
    const items = [
      { name: "现金", value: cashTotal, color: "#bde645" },
      ...activeAccounts.filter((account) => account.group === "investment").map((account) => ({ name: account.name, value: valued(account), color: account.color })),
    ].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
    const stops = items.map((item, index) => {
      const start = items.slice(0, index).reduce((sum, row) => sum + (assetTotal ? row.value / assetTotal * 100 : 0), 0);
      const end = start + (assetTotal ? item.value / assetTotal * 100 : 0);
      return `${item.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    return { items, gradient: stops.length ? `conic-gradient(${stops.join(",")})` : "conic-gradient(#e7e4dc 0 100%)" };
  }, [activeAccounts, assetTotal, cashTotal, valued]);

  const filteredTransactions = historyTransactions;

  useEffect(() => {
    if (view !== "ledger") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setHistoryLoading(true);
      setHistoryError("");
      setHistoryTransactions([]);
      setHistoryTotal(0);
      try {
        const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE), offset: String((historyPage - 1) * HISTORY_PAGE_SIZE), kind: filter });
        if (search.trim()) params.set("q", search.trim());
        const data = await fetchReadJson<TransactionHistoryPayload>(`/api/transactions?${params}`, controller.signal);
        const total = data.total ?? 0;
        const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
        if (historyPage > totalPages) {
          setHistoryPage(totalPages);
          return;
        }
        setHistoryTransactions(data.transactions ?? []);
        setHistoryTotal(total);
      } catch (error) {
        if (!controller.signal.aborted) setHistoryError(error instanceof Error ? error.message : "历史记录读取失败");
      } finally {
        if (!controller.signal.aborted) setHistoryLoading(false);
      }
    }, search ? 260 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [view, filter, search, historyPage, historyVersion]);

  const historyPageCount = Math.max(1, Math.ceil(historyTotal / HISTORY_PAGE_SIZE));
  const historyPageItems = useMemo<Array<number | string>>(() => {
    if (historyPageCount <= 7) return Array.from({ length: historyPageCount }, (_, index) => index + 1);
    if (historyPage <= 4) return [1, 2, 3, 4, 5, "end-gap", historyPageCount];
    if (historyPage >= historyPageCount - 3) return [1, "start-gap", ...Array.from({ length: 5 }, (_, index) => historyPageCount - 4 + index)];
    return [1, "start-gap", historyPage - 1, historyPage, historyPage + 1, "end-gap", historyPageCount];
  }, [historyPage, historyPageCount]);

  function changeHistoryPage(page: number) {
    const nextPage = Math.max(1, Math.min(historyPageCount, page));
    if (nextPage === historyPage) return;
    setHistoryPage(nextPage);
    window.requestAnimationFrame(() => document.querySelector(".ledger-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const manualAccounts = activeAccounts.filter((account) => account.assetType !== "crypto");
  const sourceAccounts = kind === "investment" ? manualAccounts.filter((account) => account.group === "cash") : manualAccounts;
  const sourceCurrency = accountById.get(sourceId)?.currency;
  const effectiveTransactionCurrency = (kind === "transfer" || kind === "investment" ? sourceCurrency : transactionCurrency) as MoneyCurrency || "CNY";
  const editingAccountAmount = editingTransaction && (editingTransaction.kind === "income" || editingTransaction.kind === "expense") ? Math.max(0, Math.abs(editingTransaction.sourceDelta || 0) - (editingTransaction.feeAmount || 0)) : "";
  const targetAccounts = kind === "investment" ? manualAccounts.filter((account) => account.group === "investment" && account.id !== sourceId) : manualAccounts.filter((account) => account.id !== sourceId);
  const targetCurrency = accountById.get(targetId)?.currency as MoneyCurrency | undefined;
  const baseCategories = kind === "income" ? ["工资", "生活费", "奖学金", "兼职", "投资回款", "其他"] : kind === "expense" ? ["餐饮", "交通", "购物", "学习", "娱乐", "订阅", "医疗", "旅行", "其他"] : [kind === "investment" ? "买入资产" : "账户转账"];
  const categories = Array.from(new Set(editingTransaction?.category ? [editingTransaction.category, ...baseCategories] : baseCategories));
  const annualRecurringCny = recurringBills.filter((bill) => bill.active).reduce((sum, bill) => sum + (toCny(bill.amount, bill.currency || "CNY") || 0) * (bill.frequency === "yearly" ? 1 : 12), 0);
  const crypto24hMove = activeAccounts.filter((account) => account.assetType === "crypto").reduce((sum, account) => {
    const quote = account.assetId ? market?.quotes[account.assetId] : null;
    if (!quote) return sum;
    const current = account.balance * quote.cny;
    return sum + current - current / (1 + quote.change24h / 100);
  }, 0);
  const cryptoAccounts = activeAccounts.filter((account) => account.assetType === "crypto");
  const cryptoFundingAccounts = manualAccounts.filter((account) => account.currency === cryptoCurrency);
  const selectedCryptoAccount = accountById.get(cryptoAccountId);
  const cryptoTransferTargets = cryptoAccounts.filter((account) => account.id !== cryptoAccountId && account.assetId === selectedCryptoAccount?.assetId);

  useEffect(() => {
    if ((kind === "transfer" || kind === "investment") && !targetAccounts.some((account) => account.id === targetId)) {
      const timer = window.setTimeout(() => setTargetId(targetAccounts[0]?.id ?? 0), 0);
      return () => window.clearTimeout(timer);
    }
  }, [kind, targetAccounts, targetId]);

  function accountName(id: number | null) {
    return id ? accountById.get(id)?.name ?? "已删除账户" : "未指定账户";
  }

  function showToast(message: string, tone: ToastTone = "success") {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2800);
  }

  function resetCalculator() {
    setCalculatorValue("0");
    setCalculatorStored(null);
    setCalculatorOperator(null);
    setCalculatorOverwrite(false);
  }

  function inputCalculatorDigit(digit: string) {
    setCalculatorValue((current) => {
      if (calculatorOverwrite || current === "错误") {
        setCalculatorOverwrite(false);
        return digit;
      }
      if (current.replace(/[-.]/g, "").length >= 14) return current;
      return current === "0" ? digit : `${current}${digit}`;
    });
  }

  function inputCalculatorDecimal() {
    setCalculatorValue((current) => {
      if (calculatorOverwrite || current === "错误") {
        setCalculatorOverwrite(false);
        return "0.";
      }
      return current.includes(".") ? current : `${current}.`;
    });
  }

  function backspaceCalculator() {
    if (calculatorOverwrite || calculatorValue === "错误") {
      setCalculatorValue("0");
      setCalculatorOverwrite(false);
      return;
    }
    setCalculatorValue((current) => current.length <= 1 ? "0" : current.slice(0, -1));
  }

  function applyCalculatorPercent() {
    const current = Number(calculatorValue);
    if (!Number.isFinite(current)) return resetCalculator();
    setCalculatorValue(formatCalculatorValue(current / 100));
    setCalculatorOverwrite(true);
  }

  function chooseCalculatorOperator(nextOperator: CalculatorOperator) {
    const current = Number(calculatorValue);
    if (!Number.isFinite(current)) return resetCalculator();
    if (calculatorStored !== null && calculatorOperator && !calculatorOverwrite) {
      const result = calculateValues(calculatorStored, current, calculatorOperator);
      const formatted = formatCalculatorValue(result);
      setCalculatorValue(formatted);
      setCalculatorStored(Number.isFinite(result) ? result : null);
      setCalculatorOperator(Number.isFinite(result) ? nextOperator : null);
      setCalculatorOverwrite(true);
      return;
    }
    setCalculatorStored(current);
    setCalculatorOperator(nextOperator);
    setCalculatorOverwrite(true);
  }

  function finishCalculator() {
    if (calculatorStored === null || !calculatorOperator) return;
    const current = Number(calculatorValue);
    const result = calculateValues(calculatorStored, current, calculatorOperator);
    setCalculatorValue(formatCalculatorValue(result));
    setCalculatorStored(null);
    setCalculatorOperator(null);
    setCalculatorOverwrite(true);
  }

  async function copyCalculatorResult() {
    if (calculatorValue === "错误") return;
    try {
      await navigator.clipboard.writeText(calculatorValue);
      showToast("计算结果已复制");
    } catch {
      showToast("复制失败，请长按结果复制", "error");
    }
  }

  function useCalculatorForTransaction() {
    const amount = Math.abs(Number(calculatorValue));
    const first = activeAccounts.find((account) => account.assetType !== "crypto");
    if (!Number.isFinite(amount) || amount <= 0) return showToast("请先得到一个大于 0 的结果", "error");
    if (!first) return showToast("请先添加一个普通账户", "error");
    const currency = (first.currency as MoneyCurrency) || "CNY";
    setEditingTransaction(null);
    setTransactionDeleteConfirm(false);
    setKind("expense");
    setSourceId(first.id);
    setTransactionCurrency(currency);
    setTargetId(0);
    setTransactionPreset({ title: "", amount, category: "其他", currency, accountId: first.id });
    setCalculatorOpen(false);
    setAddOpen(true);
  }

  function openNewTransaction() {
    setEditingTransaction(null);
    setTransactionPreset(null);
    setTransactionDeleteConfirm(false);
    setKind("expense");
    const first = activeAccounts.find((account) => account.assetType !== "crypto");
    setSourceId(first?.id ?? 0);
    setTransactionCurrency((first?.currency as MoneyCurrency) || "CNY");
    setTargetId(0);
    setAddOpen(true);
  }

  function openEditTransaction(tx: Transaction) {
    setEditingTransaction(tx);
    setTransactionDeleteConfirm(false);
    setKind(tx.kind);
    setSourceId(tx.accountId);
    setTransactionCurrency(tx.currency || "CNY");
    setTargetId(tx.targetAccountId ?? 0);
    setTransactionPreset(null);
    setAddOpen(true);
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    const selectedSource = accountById.get(Number(data.get("accountId")));
    const selectedSourceCurrency = (selectedSource?.currency as MoneyCurrency) || "CNY";
    const selectedTargetCurrency = (accountById.get(Number(data.get("targetAccountId")))?.currency as MoneyCurrency) || selectedSourceCurrency;
    const recordedCurrency = kind === "transfer" || kind === "investment" ? selectedSourceCurrency : transactionCurrency;
    const targetAmountInput = Number(data.get("targetAmount"));
    const accountAmountInput = Number(data.get("accountAmount"));
    const hasAccountOverride = (kind === "income" || kind === "expense") && recordedCurrency !== selectedSourceCurrency && accountAmountInput > 0;
    const accountAmount = hasAccountOverride ? accountAmountInput : convertMoney(amount, recordedCurrency, selectedSourceCurrency);
    const baseAmountCny = selectedSourceCurrency === "CNY" ? accountAmount : convertMoney(accountAmount, selectedSourceCurrency, "CNY");
    const occurredAtInput = String(data.get("occurredAt") || "");
    const automaticFxSource = recordedCurrency === "CNY" ? "CNY" : market?.estimatedFx ? "安全估算（待核对）" : market?.sources.fx || "未标注";
    const payload = {
      amount,
      currency: kind === "transfer" || kind === "investment" ? (accountById.get(Number(data.get("accountId")))?.currency || "CNY") : transactionCurrency,
      kind,
      title: String(data.get("title") || (kind === "transfer" ? "账户转账" : kind === "investment" ? "买入资产" : kind === "income" ? "一笔收入" : "一笔消费")),
      category: String(data.get("category") || categories[0]),
      accountId: Number(data.get("accountId")),
      targetAccountId: data.get("targetAccountId") ? Number(data.get("targetAccountId")) : null,
      targetAmount: kind === "transfer" || kind === "investment" ? (targetAmountInput > 0 ? targetAmountInput : convertMoney(amount, selectedSourceCurrency, selectedTargetCurrency)) : null,
      feeAmount: Number(data.get("feeAmount") || 0),
      accountAmount,
      baseAmountCny,
      fxRate: baseAmountCny / amount,
      fxSource: hasAccountOverride ? `账户实际变动 · ${selectedSourceCurrency}${selectedSourceCurrency === "CNY" ? "" : ` / ${automaticFxSource}`}` : automaticFxSource,
      fxCapturedAt: market?.fetchedAt || new Date().toISOString(),
      occurredAt: occurredAtInput ? new Date(occurredAtInput).toISOString() : new Date().toISOString(),
    };
    if (!payload.amount || payload.amount <= 0) return;
    setSaving(true);
    try {
      const response = await fetch(editingTransaction ? `/api/transactions/${editingTransaction.id}` : "/api/ledger", {
        method: editingTransaction ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "流水保存失败");
      await refreshLedger();
      setAddOpen(false);
      showToast(editingTransaction ? "流水与账户余额已同步更新" : "已记入账本");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "流水保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTransaction() {
    if (!editingTransaction) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/transactions/${editingTransaction.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "流水删除失败");
      await refreshLedger();
      setAddOpen(false);
      showToast("流水已移入回收站，账户余额已自动还原");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "流水删除失败", "error");
    } finally {
      setSaving(false);
    }
  }

  function openNewAccount() {
    setEditingAccount(null);
    setAccountAssetType("manual");
    setSelectedCryptoId("bitcoin");
    setDeleteConfirm(false);
    setAccountOpen(true);
  }

  function openEditAccount(account: Account) {
    setEditingAccount(account);
    setAccountAssetType(account.assetType ?? "manual");
    setSelectedCryptoId(account.assetId ?? "bitcoin");
    setDeleteConfirm(false);
    setAccountOpen(true);
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selectedCrypto = cryptoAssets.find(([id]) => id === String(data.get("assetId"))) ?? cryptoAssets[0];
    const payload = { name: String(data.get("name") || ""), group: accountAssetType === "crypto" ? "investment" : String(data.get("group") || "cash"), balance: Number(data.get("balance")), costBasisCny: Number(data.get("costBasisCny") || 0), currency: String(data.get("currency") || "CNY"), assetType: accountAssetType, assetId: accountAssetType === "crypto" ? selectedCrypto[0] : null, assetSymbol: accountAssetType === "crypto" ? selectedCrypto[1] : null, color: String(data.get("color") || accountColors[0]) };
    setAccountSaving(true);
    try {
      const response = await fetch(editingAccount ? `/api/accounts/${editingAccount.id}` : "/api/accounts", { method: editingAccount ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "账户保存失败");
      await refreshLedger();
      setAccountOpen(false);
      showToast(editingAccount ? "账户信息与余额已更新" : "新账户已添加");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "账户保存失败", "error");
    } finally {
      setAccountSaving(false);
    }
  }

  async function deleteAccount() {
    if (!editingAccount) return;
    setAccountSaving(true);
    try {
      const response = await fetch(`/api/accounts/${editingAccount.id}`, { method: "DELETE" });
      const result = await response.json() as { mode?: "archived"; linkedTransactions?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "账户删除失败");
      await refreshLedger();
      setAccountOpen(false);
      showToast(`账户已移入回收站，${result.linkedTransactions ?? 0} 条历史关联已保留`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "账户删除失败", "error");
    } finally {
      setAccountSaving(false);
    }
  }

  async function restoreAccount(account: Account) {
    try {
      const response = await fetch(`/api/accounts/${account.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ archived: false }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "账户恢复失败");
      await refreshLedger();
      showToast("账户已恢复");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "账户恢复失败", "error");
    }
  }

  function openPlanEditor() {
    setPlanBudgetDraft(monthlyBudget ? String(monthlyBudget) : "");
    setPlanSavingsDraft(savingsTarget ? String(savingsTarget) : "");
    setPlanCategoriesDraft(categoryBudgets.map((item) => ({ key: String(item.id), category: item.category, amount: String(item.amount) })));
    setPlanOpen(true);
  }

  function addPlanCategory() {
    setPlanCategoriesDraft((items) => [...items, { key: `new-${Date.now()}-${items.length}`, category: "", amount: "" }]);
  }

  async function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlanSaving(true);
    try {
      const response = await fetch("/api/plan", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ totalBudget: Number(planBudgetDraft || 0), savingsTarget: Number(planSavingsDraft || 0), categories: planCategoriesDraft.filter((item) => item.category.trim()).map((item) => ({ category: item.category, amount: Number(item.amount || 0) })) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "计划保存失败");
      await refreshLedger();
      setPlanOpen(false);
      showToast("本月计划已更新");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "计划保存失败", "error");
    } finally {
      setPlanSaving(false);
    }
  }

  function openNewBill() {
    setEditingBill(null);
    setBillCurrency("CNY");
    setBillDeleteConfirm(false);
    setBillOpen(true);
  }

  function openEditBill(bill: RecurringBill) {
    setEditingBill(bill);
    setBillCurrency(bill.currency || "CNY");
    setBillDeleteConfirm(false);
    setBillOpen(true);
  }

  async function submitBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = { title: String(data.get("title") || ""), category: String(data.get("category") || "固定支出"), amount: Number(data.get("amount")), currency: billCurrency, dueDay: Number(data.get("dueDay")), accountId: data.get("accountId") ? Number(data.get("accountId")) : null, active: data.get("active") === "on", frequency: String(data.get("frequency") || "monthly"), nextDueDate: String(data.get("nextDueDate") || "") || null, trialEndsAt: String(data.get("trialEndsAt") || "") || null };
    setBillSaving(true);
    try {
      const response = await fetch(editingBill ? `/api/recurring-bills/${editingBill.id}` : "/api/recurring-bills", { method: editingBill ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "固定账单保存失败");
      await refreshLedger();
      setBillOpen(false);
      showToast(editingBill ? "固定账单已更新" : "固定账单已添加");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "固定账单保存失败", "error");
    } finally {
      setBillSaving(false);
    }
  }

  async function deleteBill() {
    if (!editingBill) return;
    setBillSaving(true);
    try {
      const response = await fetch(`/api/recurring-bills/${editingBill.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "固定账单删除失败");
      await refreshLedger();
      setBillOpen(false);
      showToast("固定账单已移入回收站");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "固定账单删除失败", "error");
    } finally {
      setBillSaving(false);
    }
  }

  function recordBill(bill: RecurringBill) {
    const account = (bill.accountId ? accountById.get(bill.accountId) : null) ?? manualAccounts.find((item) => item.currency === bill.currency) ?? manualAccounts[0];
    if (!account) return openNewAccount();
    setEditingTransaction(null);
    setTransactionDeleteConfirm(false);
    setKind("expense");
    setSourceId(account.id);
    setTransactionCurrency(bill.currency || "CNY");
    setTransactionPreset({ title: bill.title, amount: bill.amount, category: bill.category, currency: bill.currency || "CNY", accountId: account.id });
    setAddOpen(true);
  }

  function openNewCrypto(account?: Account) {
    const selected = account?.assetType === "crypto" ? account : cryptoAccounts[0];
    if (!selected) return openNewAccount();
    setEditingCrypto(null);
    setCryptoDeleteConfirm(false);
    setCryptoKind("buy");
    setCryptoAccountId(selected.id);
    setCryptoTargetId(0);
    const funding = manualAccounts.find((item) => item.currency === "CNY") ?? manualAccounts[0];
    setCryptoFundingId(funding?.id ?? 0);
    setCryptoCurrency((funding?.currency as MoneyCurrency) || "CNY");
    setCryptoOpen(true);
  }

  function openEditCrypto(tx: CryptoTransaction) {
    setEditingCrypto(tx);
    setCryptoDeleteConfirm(false);
    setCryptoKind(tx.kind);
    setCryptoAccountId(tx.accountId);
    setCryptoTargetId(tx.targetAccountId ?? 0);
    setCryptoFundingId(tx.fundingAccountId ?? 0);
    setCryptoCurrency(tx.currency || "CNY");
    setCryptoOpen(true);
  }

  async function submitCrypto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount") || 0);
    const occurredAtInput = String(data.get("occurredAt") || "");
    const payload = {
      accountId: cryptoAccountId,
      targetAccountId: cryptoKind === "transfer" ? cryptoTargetId : null,
      fundingAccountId: cryptoKind === "buy" || cryptoKind === "sell" ? (cryptoFundingId || null) : null,
      kind: cryptoKind,
      quantity: Number(data.get("quantity")),
      amount,
      currency: cryptoCurrency,
      feeAmount: Number(data.get("feeAmount") || 0),
      baseAmountCny: amount > 0 ? convertMoney(amount, cryptoCurrency, "CNY") : 0,
      fxRate: convertMoney(1, cryptoCurrency, "CNY"),
      fxSource: cryptoCurrency === "CNY" ? "CNY" : market?.estimatedFx ? "安全估算（待核对）" : market?.sources.fx || "未标注",
      fxCapturedAt: market?.fetchedAt || new Date().toISOString(),
      occurredAt: occurredAtInput ? new Date(occurredAtInput).toISOString() : new Date().toISOString(),
      note: String(data.get("note") || ""),
    };
    setCryptoSaving(true);
    try {
      const response = await fetch(editingCrypto ? `/api/crypto-transactions/${editingCrypto.id}` : "/api/crypto-transactions", { method: editingCrypto ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Crypto 操作保存失败");
      await refreshLedger();
      setCryptoOpen(false);
      showToast(editingCrypto ? "Crypto 操作及成本已更新" : "Crypto 持仓与成本已更新");
    } catch (error) { showToast(error instanceof Error ? error.message : "Crypto 操作保存失败", "error"); }
    finally { setCryptoSaving(false); }
  }

  async function deleteCrypto() {
    if (!editingCrypto) return;
    setCryptoSaving(true);
    try {
      const response = await fetch(`/api/crypto-transactions/${editingCrypto.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Crypto 操作删除失败");
      await refreshLedger();
      setCryptoOpen(false);
      showToast("Crypto 操作已移入回收站，持仓、成本和资金账户均已还原");
    } catch (error) { showToast(error instanceof Error ? error.message : "Crypto 操作删除失败", "error"); }
    finally { setCryptoSaving(false); }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !window.confirm("恢复备份会替换当前全部账本数据。确认继续吗？")) return;
    setRestoring(true);
    try {
      const response = await fetch("/api/backup", { method: "POST", headers: { "content-type": "application/json" }, body: await file.text() });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "恢复失败");
      await refreshLedger();
      setDataOpen(false);
      showToast("备份已恢复");
    } catch (error) { showToast(error instanceof Error ? error.message : "恢复备份失败", "error"); }
    finally { setRestoring(false); }
  }

  async function restoreTrashItem(item: TrashItem) {
    const key = `${item.type}-${item.id}`;
    setTrashBusy(key);
    try {
      const response = await fetch("/api/trash", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: item.type, id: item.id }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "恢复失败");
      await refreshLedger();
      showToast(`“${item.title}”已恢复`);
    } catch (error) { showToast(error instanceof Error ? error.message : "恢复失败", "error"); }
    finally { setTrashBusy(""); }
  }

  async function purgeTrashItem(item: TrashItem) {
    if (!window.confirm(`永久删除“${item.title}”？此操作无法撤销。`)) return;
    const key = `${item.type}-${item.id}`;
    setTrashBusy(key);
    try {
      const response = await fetch("/api/trash", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: item.type, id: item.id }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "永久删除失败");
      await refreshLedger();
      showToast("已永久删除");
    } catch (error) { showToast(error instanceof Error ? error.message : "永久删除失败", "error"); }
    finally { setTrashBusy(""); }
  }

  function transactionRow(tx: Transaction, showDate = false, editable = false) {
    const meta = kindMeta[tx.kind];
    const target = tx.targetAccountId ? ` → ${accountName(tx.targetAccountId)}` : "";
    const lockedFx = tx.fxRate && tx.currency !== "CNY" ? ` · 锁定汇率 1 ${tx.currency} = ¥${Number(tx.fxRate).toFixed(4)}${tx.fxSource ? ` · ${tx.fxSource}` : ""}` : "";
    return <article className="transaction" key={tx.id}>
      <span className={`tx-icon ${meta.tone}`}>{meta.icon}</span>
      <div className="tx-copy"><strong>{tx.title}</strong><span>{tx.category} · {accountName(tx.accountId)}{target}</span></div>
      <div className="tx-amount"><strong className={tx.kind}>{meta.sign}{displayHistoricalMoney(tx)}</strong><span>{originalMoney(tx.amount, tx.currency || "CNY")}{tx.targetAmount && tx.targetCurrency ? ` → ${originalMoney(tx.targetAmount, tx.targetCurrency)}` : ""}{tx.feeAmount > 0 ? ` · 手续费 ${originalMoney(tx.feeAmount, tx.feeCurrency || tx.currency)}` : ""}{lockedFx}{showDate ? ` · ${dayLabel(tx.occurredAt)}` : ""} · {timeLabel(tx.occurredAt)}</span>{editable && <button className="tx-edit-button" onClick={() => openEditTransaction(tx)}>编辑</button>}</div>
    </article>;
  }

  return <main className="app-shell">
    <aside className="side-rail" aria-label="主要导航">
      <div className="brand-mark" aria-label="FlowLedger">FL<span>.</span></div>
      <nav className="side-nav">{navItems.map((item) => <button key={item.id} className={view === item.id ? "nav-button active" : "nav-button"} onClick={() => setView(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
      <button className="profile-chip" aria-label="数据与安全" onClick={() => setDataOpen(true)}><span>AZ</span></button>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div><p className="eyebrow">{dateText}</p><h1 key={view}>{view === "overview" ? "早上好，Andy" : navItems.find((item) => item.id === view)?.label}</h1></div>
        <div className="top-actions"><button className="icon-button utility-letter" onClick={() => setCalculatorOpen(true)} aria-label="打开计算器"><span>算</span></button><button className="icon-button mobile-data-button" onClick={() => setDataOpen(true)} aria-label="打开数据与安全"><span>备</span></button><div className="unit-switch" aria-label="净资产显示单位">{(["CNY", "USD", "USDT"] as DisplayUnit[]).map((unit) => <button key={unit} className={displayUnit === unit ? "active" : ""} onClick={() => setDisplayUnit(unit)}>{unit}</button>)}</div><span className={loading ? "sync-pill syncing" : "sync-pill"}>{loading ? "正在同步" : "账本已同步"}</span><button className="icon-button" onClick={() => setHidden((value) => !value)} aria-label={hidden ? "显示金额" : "隐藏金额"}><Icon name={hidden ? "eyeOff" : "eye"} /></button><button className="add-button desktop-add" onClick={openNewTransaction}><Icon name="plus" size={19} />记一笔</button></div>
      </header>

      {syncError && <div className="sync-notice"><span>!</span>{syncError}</div>}

      {view === "overview" && <div className="dashboard-grid view-motion">
        <section className="net-worth-card clean-net-worth">
          <div className="card-heading"><div><span className="label">净资产 · {displayUnit}{valuationMissing ? ` · 暂缺 ${valuationMissing} 项估值` : ""}</span><p className="amount-large value-motion" key={displayUnit}>{valuationMissing ? "约 " : ""}{displayAssetMoney(netWorth)}</p></div><span className="growth-pill neutral">{marketError ? "沿用最后可用估值" : marketLoading ? "行情刷新中" : market?.stale ? "部分行情为缓存" : "实时估值"}</span></div>
          {activeAccounts.length ? <div className="net-breakdown"><div><span>现金资产</span><strong>{displayAssetMoney(cashTotal)}</strong><i style={{ width: `${assetTotal ? cashTotal / assetTotal * 100 : 0}%` }} /></div><div><span>投资资产</span><strong>{displayAssetMoney(investmentTotal)}</strong><i style={{ width: `${assetTotal ? investmentTotal / assetTotal * 100 : 0}%` }} /></div><div><span>负债</span><strong>{displayAssetMoney(liabilityTotal)}</strong><i className="debt" style={{ width: `${assetTotal ? Math.min(100, liabilityTotal / assetTotal * 100) : 0}%` }} /></div></div> : <div className="overview-empty"><strong>从真实账户开始</strong><p>添加银行卡、微信、现金或投资账户，净资产会自动汇总。</p><button onClick={() => { setView("assets"); openNewAccount(); }}>新增账户</button></div>}
        </section>

        <section className="summary-row" aria-label="本月收支摘要">
          <article className="summary-card"><span className="metric-icon income"><Icon name="arrowDown" size={18} /></span><div><span className="label">本月收入</span><strong>{displayMoney(monthIncome)}</strong></div></article>
          <article className="summary-card"><span className="metric-icon expense"><Icon name="arrowUp" size={18} /></span><div><span className="label">本月支出</span><strong>{displayMoney(monthExpense)}</strong></div></article>
          <article className="summary-card budget-card"><div className="budget-copy"><span className="label">预算剩余</span><strong>{monthlyBudget ? displayMoney(Math.max(0, monthlyBudget - monthExpense)) : "未设置"}</strong></div><span className="budget-caption">{monthlyBudget ? `已用 ${budgetUsed.toFixed(0)}%` : "前往计划页设置"}</span><div className="progress-track"><span style={{ width: `${budgetUsed}%` }} /></div></article>
        </section>

        <section className="panel change-panel">
          <div className="section-heading"><div><span className="kicker">{monthName}现金流</span><h2>本月收支结构</h2></div><button className="text-link" onClick={() => setView("ledger")}>管理流水 <Icon name="chevron" size={15} /></button></div>
          {monthTransactions.length ? <><div className="change-total"><span>收支结余</span><strong>{savings >= 0 ? "+" : "−"}{displayMoney(Math.abs(savings))}</strong></div><div className="change-bars"><div className="change-row"><span>收入</span><div className="bar-track"><i className="lime" style={{ width: `${Math.max(5, monthIncome / Math.max(monthIncome, monthExpense) * 100)}%` }} /></div><strong>+{displayMoney(monthIncome)}</strong></div><div className="change-row"><span>支出</span><div className="bar-track"><i className="sand" style={{ width: `${Math.max(5, monthExpense / Math.max(monthIncome, monthExpense) * 100)}%` }} /></div><strong>−{displayMoney(monthExpense)}</strong></div></div></> : <div className="panel-empty"><strong>本月还没有流水</strong><span>记录第一笔收入或支出后，这里会自动生成结构。</span><button onClick={openNewTransaction}>记第一笔</button></div>}
        </section>

        <section className="panel allocation-panel">
          <div className="section-heading compact"><div><span className="kicker">全局视角</span><h2>资产配置</h2></div><button className="icon-button small" onClick={() => setView("assets")} aria-label="查看资产"><Icon name="chevron" size={17} /></button></div>
          {assetTotal ? <div className="allocation-body"><div className="donut" style={{ background: allocation.gradient }}><div><span>投资资产</span><strong>{investmentShare.toFixed(0)}%</strong></div></div><div className="legend">{allocation.items.slice(0, 4).map((item) => <div key={item.name}><i className="dot" style={{ background: item.color }} /><span>{item.name}</span><strong>{(item.value / assetTotal * 100).toFixed(1)}%</strong></div>)}</div></div> : <div className="panel-empty compact-empty"><strong>暂无资产配置</strong><span>添加账户后自动生成。</span></div>}
        </section>

        <section className="panel transactions-panel">
          <div className="section-heading compact"><div><span className="kicker">最新</span><h2>最近明细</h2></div><button className="text-link" onClick={() => setView("ledger")}>全部明细 <Icon name="chevron" size={15} /></button></div>
          {transactions.length ? <div className="transaction-list">{transactions.slice(0, 4).map((tx) => transactionRow(tx))}</div> : <div className="panel-empty horizontal-empty"><span>还没有收支记录</span><button onClick={openNewTransaction}>记一笔</button></div>}
        </section>
        <section className="panel insight-panel">
          <div className="section-heading compact"><div><span className="kicker">洞察</span><h2>影响财富的三个数字</h2></div></div>
          <div className="insight-grid"><div><span>Crypto 24h 变动</span><strong className={crypto24hMove >= 0 ? "positive" : "negative"}>{crypto24hMove >= 0 ? "+" : "−"}{displayMoney(Math.abs(crypto24hMove))}</strong><small>按当前持仓估算</small></div><div><span>年度固定支出</span><strong>{displayMoney(annualRecurringCny)}</strong><small>月付 × 12 + 年付</small></div><div><span>预算偏差</span><strong className={monthlyBudget >= monthExpense ? "positive" : "negative"}>{monthlyBudget ? displayMoney(Math.abs(monthlyBudget - monthExpense)) : "未设置"}</strong><small>{monthlyBudget ? (monthlyBudget >= monthExpense ? "仍可使用" : "已超预算") : "在计划页设置"}</small></div></div>
        </section>
      </div>}

      {view === "ledger" && <div className="view-shell ledger-view view-motion">
        <section className="view-hero ledger-hero"><div><span className="kicker">{now.getFullYear()} · {monthName} CASH FLOW</span><p>本月净流入</p><strong key={displayUnit} className={`${savings >= 0 ? "positive" : "negative"} value-motion`}>{savings >= 0 ? "+" : "−"}{displayMoney(Math.abs(savings))}</strong></div><div className="mini-stats"><div><span>日均支出</span><strong>{displayMoney(monthExpense / Math.max(1, now.getDate()))}</strong></div><div><span>记账笔数</span><strong>{monthTransactions.length} 笔</strong></div></div></section>
        <section className="panel ledger-panel"><div className="ledger-tools"><label className="search-box"><Icon name="search" size={18} /><input value={search} onChange={(event) => { setSearch(event.target.value); setHistoryPage(1); }} placeholder="搜索账单、分类或账户" /></label><div className="filter-chips">{(["all", "expense", "income", "transfer", "investment"] as const).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => { setFilter(item); setHistoryPage(1); }}>{item === "all" ? "全部" : kindMeta[item].label}</button>)}</div><button className="account-add-button" onClick={openNewTransaction}><Icon name="plus" size={15} />新增流水</button></div><div className="history-summary"><div><strong>{search.trim() || filter !== "all" ? "筛选结果" : "全部流水"}</strong><span>{historyLoading ? "正在读取本页…" : `第 ${historyPage} / ${historyPageCount} 页 · 共 ${historyTotal} 条`}</span></div><span>每页显示 {HISTORY_PAGE_SIZE} 条，按时间从新到旧排列</span></div><div className="ledger-list">{historyLoading ? <div className="history-loading" aria-label="正在读取流水"><i /><i /><i /></div> : filteredTransactions.length ? filteredTransactions.map((tx) => transactionRow(tx, true, true)) : <div className="empty-state"><Icon name="list" size={28} /><strong>{historyError ? "历史记录暂时无法读取" : search.trim() || filter !== "all" ? "没有找到相关记录" : "账本还是空的"}</strong><span>{historyError || (search.trim() || filter !== "all" ? "清空搜索或选择“全部”后查看完整流水。" : "从第一笔真实收支开始。")}</span>{historyError ? <button className="empty-action" onClick={() => setHistoryVersion((value) => value + 1)}>重新加载</button> : !search.trim() && filter === "all" && <button className="empty-action" onClick={openNewTransaction}>记一笔</button>}</div>}</div>{historyTotal > 0 && <nav className="history-pagination" aria-label="流水分页"><button className="page-step" onClick={() => changeHistoryPage(historyPage - 1)} disabled={historyPage === 1} aria-label="上一页">上一页</button><div className="page-numbers">{historyPageItems.map((item) => typeof item === "number" ? <button key={item} className={historyPage === item ? "active" : ""} onClick={() => changeHistoryPage(item)} aria-current={historyPage === item ? "page" : undefined}>{item}</button> : <span key={item}>…</span>)}</div><button className="page-step" onClick={() => changeHistoryPage(historyPage + 1)} disabled={historyPage === historyPageCount} aria-label="下一页">下一页</button></nav>}</section>
      </div>}

      {view === "assets" && <div className="view-shell assets-view view-motion">
        <section className="asset-hero"><div><span className="kicker">PERSONAL BALANCE SHEET</span><p>净资产 · {displayUnit}{valuationMissing ? " · 部分待估值" : ""}</p><strong className="value-motion" key={displayUnit}>{valuationMissing ? "约 " : ""}{displayAssetMoney(netWorth)}</strong><span className="asset-caption">总资产 {displayAssetMoney(assetTotal)} · 总负债 {displayAssetMoney(liabilityTotal)}{valuationMissing ? ` · 不含 ${valuationMissing} 项缺失行情` : ""}</span><div className="market-status"><button onClick={() => void refreshMarket()} disabled={marketLoading}>{marketLoading ? "正在刷新…" : "刷新行情"}</button><span>{marketError || (market ? `${market.sources.crypto} / FX ${market.sources.fx}${market.stale ? " · 部分缓存" : ""}${market.estimatedFx ? " · 汇率估算" : ""} · ${new Date(market.fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "正在连接行情")}</span></div></div><div className="balance-visual"><span style={{ width: `${assetTotal ? Math.max(0, Math.min(100, netWorth / assetTotal * 100)) : 0}%` }} /><i>资产</i><i>负债</i></div></section>
        <section className="asset-layout">
          <div className="panel account-panel"><div className="section-heading compact account-heading"><div><span className="kicker">账户</span><h2>资产与负债</h2></div><div className="account-heading-actions"><span className="account-count">{activeAccounts.length} 个账户</span><button className="account-add-button" onClick={openNewAccount}><Icon name="plus" size={15} />新增账户</button></div></div>{activeAccounts.length === 0 && <div className="account-empty"><span>还没有可用账户</span><strong>先添加银行卡、支付账户或 Crypto 持仓</strong><button onClick={openNewAccount}>添加第一个账户</button></div>}{(["cash", "investment", "liability"] as AccountGroup[]).map((group) => { const rows = activeAccounts.filter((account) => account.group === group); if (!rows.length) return null; return <div className="account-group" key={group}><div className="group-heading"><span>{({ cash: "现金账户", investment: "投资账户", liability: "负债账户" })[group]}</span><strong>{displayAssetMoney(rows.reduce((sum, account) => sum + valued(account), 0))}</strong></div>{rows.map((account) => { const quote = account.assetId ? market?.quotes[account.assetId] : null; const currentValue = accountValue(account); const marketValueCny = quote ? account.balance * quote.cny : Number.NaN; const unrealized = Number.isFinite(marketValueCny) ? marketValueCny - (account.costBasisCny || 0) : Number.NaN; return <article className="account-row" key={account.id}><span className="account-logo" style={{ background: account.color }}>{account.short}</span><div><strong>{account.name}</strong><span>{account.assetType === "crypto" ? `${money.format(account.balance)} ${account.assetSymbol} · ${quote ? `${quote.change24h >= 0 ? "+" : ""}${quote.change24h.toFixed(2)}% / 24h` : "行情缺失，未计入总额"}` : `${account.currency} · ${group === "investment" ? "市值" : group === "liability" ? "待还" : "可用余额"}`}</span>{account.assetType === "crypto" && <small className={Number.isFinite(unrealized) && unrealized >= 0 ? "pnl positive" : "pnl negative"}>成本 {displayMoney(account.costBasisCny || 0)} · 未实现 {Number.isFinite(unrealized) ? `${unrealized >= 0 ? "+" : "−"}${displayMoney(Math.abs(unrealized))}` : "待估值"} · 已实现 {account.realizedPnlCny && account.realizedPnlCny < 0 ? "−" : "+"}{displayMoney(Math.abs(account.realizedPnlCny || 0))}</small>}</div><div className="account-actions"><b>{Number.isFinite(currentValue) ? displayAssetMoney(currentValue) : "待估值"}</b>{account.assetType === "crypto" && <button onClick={() => openNewCrypto(account)}>记持仓</button>}<button onClick={() => openEditAccount(account)}>编辑</button></div></article>; })}</div>; })}{archivedAccounts.length > 0 && <div className="archived-accounts"><div className="group-heading"><span>已归档账户</span><strong>{archivedAccounts.length} 个</strong></div>{archivedAccounts.map((account) => <article key={account.id}><span className="account-logo muted" style={{ background: account.color }}>{account.short}</span><div><strong>{account.name}</strong><span>历史流水仍然保留</span></div><button onClick={() => restoreAccount(account)}>恢复</button></article>)}</div>}</div>
          <aside className="panel reconcile-card"><span className="reconcile-icon"><Icon name="check" /></span><span className="kicker">行情健康</span><h2>{market?.stale || marketError ? "已启用安全保护" : "多源行情正常"}</h2><p>系统会依次使用多个行情源，并显示更新时间、缓存与估算状态。缺失行情不会再把资产错误显示成 0。</p><button className="reconcile-action" onClick={() => setDataOpen(true)}>备份与导出</button></aside>
        </section>
        <section className="panel crypto-ledger"><div className="section-heading compact"><div><span className="kicker">CRYPTO LEDGER</span><h2>持仓操作与成本</h2></div><button className="account-add-button" onClick={() => openNewCrypto()}><Icon name="plus" size={15} />新增操作</button></div>{cryptoTransactions.length ? <div className="crypto-history">{cryptoTransactions.map((tx) => <article key={tx.id}><span className={`crypto-action ${tx.kind}`}>{cryptoKindMeta[tx.kind].label}</span><div><strong>{accountName(tx.accountId)}{tx.targetAccountId ? ` → ${accountName(tx.targetAccountId)}` : ""}</strong><small>{dayLabel(tx.occurredAt)} · {timeLabel(tx.occurredAt)}{tx.note ? ` · ${tx.note}` : ""}</small></div><b>{cryptoKindMeta[tx.kind].sign}{money.format(tx.quantity)} {accountById.get(tx.accountId)?.assetSymbol}</b><span>{tx.amount > 0 ? originalMoney(tx.amount, tx.currency) : "无现金成交额"}</span><button onClick={() => openEditCrypto(tx)}>编辑</button></article>)}</div> : <div className="panel-empty compact-empty"><strong>还没有 Crypto 操作</strong><span>记录买入、卖出、转入、转出或账户互转后，系统会计算成本与盈亏。</span><button onClick={() => openNewCrypto()}>记录第一笔</button></div>}</section>
      </div>}

      {view === "plan" && <div className="view-shell plan-view view-motion">
        <section className="budget-hero"><div><span className="kicker">{now.getFullYear()} · {monthName} PLAN</span><h2>本月预算</h2><strong className="value-motion" key={displayUnit}>{monthlyBudget ? displayMoney(Math.max(0, monthlyBudget - monthExpense)) : "未设置"}</strong><p>{monthlyBudget ? `还可以花 · 总预算 ${displayMoney(monthlyBudget)}` : "设置预算后，日常支出会自动追踪"}</p><button className="hero-edit-button" onClick={openPlanEditor}>编辑本月计划</button></div><div className="budget-ring" style={{ background: `conic-gradient(var(--lime) 0 ${budgetUsed}%, rgba(255,255,255,.12) ${budgetUsed}% 100%)` }}><div><strong>{budgetUsed.toFixed(0)}%</strong><span>已使用</span></div></div></section>
        <div className="plan-grid"><section className="panel category-budget"><div className="section-heading compact"><div><span className="kicker">分类预算</span><h2>预算执行情况</h2></div><button className="small-edit-button" onClick={openPlanEditor}>编辑</button></div>{categoryBudgets.length ? <div className="category-budget-list">{categoryBudgets.map((item) => { const spent = monthTransactions.filter((tx) => tx.kind === "expense" && tx.category === item.category).reduce((sum, tx) => sum + historicalCny(tx), 0); const pct = item.amount ? Math.min(100, spent / item.amount * 100) : 0; return <div className="category-budget-row" key={item.id}><div><strong>{item.category}</strong><span>{displayMoney(spent)} / {displayMoney(item.amount)}</span></div><div className="category-track"><span style={{ width: `${pct}%` }} /></div><b>{pct.toFixed(0)}%</b></div>; })}</div> : <div className="panel-empty"><strong>还没有分类预算</strong><span>你可以按餐饮、学习、旅行等维度自由设置。</span><button onClick={openPlanEditor}>设置分类</button></div>}</section><aside className="panel savings-card"><span className="kicker">储蓄目标</span><strong>{savingsTarget ? displayMoney(savingsTarget) : "未设置"}</strong><p>本月实际结余 {savings >= 0 ? "+" : "−"}{displayMoney(Math.abs(savings))}</p><div className="savings-scale"><span style={{ width: `${savingsTarget ? Math.max(0, Math.min(100, savings / savingsTarget * 100)) : 0}%` }} /></div><small>{savingsTarget ? `已完成 ${Math.max(0, savings / savingsTarget * 100).toFixed(0)}%` : "在本月计划中设置目标"}</small></aside><section className="panel recurring-panel"><div className="section-heading compact"><div><span className="kicker">固定账单</span><h2>周期支出与提醒</h2></div><div className="recurring-actions"><span className="recurring-total">年化 {displayMoney(annualRecurringCny)}</span><button className="small-edit-button" onClick={openNewBill}><Icon name="plus" size={14} />新增</button></div></div>{recurringBills.length ? <div className="recurring-list">{recurringBills.map((bill) => <article className={bill.active ? "" : "inactive"} key={bill.id}><span>{bill.title.slice(0, 1)}</span><div><strong>{bill.title}</strong><small>{bill.active ? `${bill.frequency === "yearly" ? "每年" : "每月"} ${bill.dueDay} 日 · ${accountName(bill.accountId)} · ${originalMoney(bill.amount, bill.currency || "CNY")}${bill.nextDueDate ? ` · 下次 ${bill.nextDueDate}` : ""}${bill.trialEndsAt ? ` · 试用至 ${bill.trialEndsAt}` : ""}` : "已暂停"}</small></div><b>−{displayFlowMoney(bill.amount, bill.currency || "CNY")}</b><div className="bill-actions"><button className="bill-record-button" onClick={() => recordBill(bill)}>记账</button><button className="bill-edit-button" onClick={() => openEditBill(bill)}>编辑</button></div></article>)}</div> : <div className="panel-empty compact-empty"><strong>还没有固定账单</strong><span>添加房租、订阅或其他周期支出。</span><button onClick={openNewBill}>新增固定账单</button></div>}</section></div>
      </div>}
    </div>

    <nav className="mobile-nav" aria-label="移动端导航">{navItems.slice(0, 2).map((item) => <button key={item.id} className={view === item.id ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => setView(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}<button className="floating-add" onClick={openNewTransaction} aria-label="记一笔"><Icon name="plus" size={25} /></button>{navItems.slice(2).map((item) => <button key={item.id} className={view === item.id ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => setView(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>

    {addOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setAddOpen(false)}><section className="quick-sheet" role="dialog" aria-modal="true" aria-labelledby="transaction-dialog-title" key={`${editingTransaction?.id ?? "new-transaction"}-${transactionPreset?.title ?? ""}`}><div className="sheet-handle" /><header className="sheet-header"><div><span className="kicker">TRANSACTION</span><h2 id="transaction-dialog-title">{editingTransaction ? "编辑流水" : "记一笔"}</h2></div><button className="icon-button" onClick={() => setAddOpen(false)} aria-label="关闭"><Icon name="close" /></button></header>{manualAccounts.length === 0 ? <div className="quick-no-account"><span className="placeholder-icon"><Icon name="wallet" size={26} /></span><strong>先添加一个普通账户</strong><p>记账前，需要先录入银行卡、现金或其他资金账户。</p><button type="button" className="add-button" onClick={() => { setAddOpen(false); openNewAccount(); }}>新增账户</button></div> : <><div className="kind-tabs">{(["expense", "income", "transfer", "investment"] as TxKind[]).map((item) => <button key={item} className={kind === item ? "active" : ""} onClick={() => { setKind(item); setTransactionPreset(null); const first = item === "investment" ? manualAccounts.find((account) => account.group === "cash") : manualAccounts[0]; if (first) setSourceId(first.id); }}>{kindMeta[item].label}</button>)}</div>{!editingTransaction && recurringBills.some((bill) => bill.active) && <div className="quick-templates"><span>快捷模板</span>{recurringBills.filter((bill) => bill.active).slice(0, 3).map((bill) => <button type="button" key={bill.id} onClick={() => recordBill(bill)}>{bill.title}</button>)}</div>}<form onSubmit={submitTransaction}><label className="amount-field"><span>{unitSymbols[effectiveTransactionCurrency]}</span><input name="amount" type="number" inputMode="decimal" step="any" min="0" placeholder="0.00" defaultValue={editingTransaction?.amount ?? transactionPreset?.amount ?? ""} autoFocus /></label><div className="form-grid"><label><span>交易币种</span><select value={effectiveTransactionCurrency} onChange={(event) => setTransactionCurrency(event.target.value as MoneyCurrency)} disabled={kind === "transfer" || kind === "investment"}>{moneyCurrencies.map((currency) => <option value={currency.code} key={currency.code}>{currency.label}</option>)}</select></label><label><span>{kind === "income" ? "入账账户" : kind === "transfer" ? "转出账户" : kind === "investment" ? "资金账户" : "支出账户"}</span><select name="accountId" value={sourceId} onChange={(event) => setSourceId(Number(event.target.value))}>{sourceAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>{(kind === "income" || kind === "expense") && effectiveTransactionCurrency !== sourceCurrency && <label><span>账户实际变动 · {sourceCurrency}</span><input name="accountAmount" type="number" min="0" step="any" defaultValue={editingAccountAmount} placeholder="可填银行卡实际扣款" /></label>}<label><span>发生时间</span><input name="occurredAt" type="datetime-local" defaultValue={toLocalInput(editingTransaction?.occurredAt)} /></label><label className="wide"><span>备注</span><input name="title" defaultValue={editingTransaction?.title ?? transactionPreset?.title ?? ""} placeholder="这笔钱是做什么的？" /></label>{(kind === "transfer" || kind === "investment") && <><label className="wide"><span>{kind === "investment" ? "转入投资账户" : "转入账户"}</span><select name="targetAccountId" value={targetId} onChange={(event) => setTargetId(Number(event.target.value))}>{targetAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label><label><span>实际到账 · {targetCurrency || "—"}</span><input name="targetAmount" type="number" min="0" step="any" defaultValue={editingTransaction?.targetAmount ?? ""} placeholder={targetCurrency === sourceCurrency ? "默认等于转出金额" : "输入兑换后金额"} /></label><label><span>手续费 · {sourceCurrency || "—"}</span><input name="feeAmount" type="number" min="0" step="any" defaultValue={editingTransaction?.feeAmount ?? 0} /></label></>}<label className="wide"><span>分类</span><div className="category-chips">{categories.map((category) => <label key={category}><input type="radio" name="category" value={category} defaultChecked={category === (editingTransaction?.category ?? transactionPreset?.category ?? categories[0])} /><span>{category}</span></label>)}</div></label></div><div className={`entry-rule ${market?.estimatedFx && effectiveTransactionCurrency !== "CNY" ? "warning" : ""}`}><Icon name="arrowRight" size={16} /><span>{kind === "expense" || kind === "income" ? market?.estimatedFx && effectiveTransactionCurrency !== "CNY" ? "当前汇率来自安全估算；建议填写账户实际变动金额，保存后仍可再次编辑校准。" : "将锁定本笔交易的 CNY 折算值、汇率来源和时间；以后行情变化不会改写历史报表。" : `${sourceCurrency || "转出币种"} 与 ${targetCurrency || "到账币种"} 分别入账，实际到账和手续费会保留。`}</span></div>{transactionDeleteConfirm && <div className="delete-confirm"><div><strong>移入回收站？</strong><span>账户余额会自动还原，之后仍可从“数据与安全”恢复。</span></div><button type="button" onClick={() => setTransactionDeleteConfirm(false)}>取消</button><button type="button" className="danger" onClick={deleteTransaction} disabled={saving}>移入回收站</button></div>}<div className="account-form-actions">{editingTransaction && !transactionDeleteConfirm ? <button className="delete-account" type="button" onClick={() => setTransactionDeleteConfirm(true)}>删除流水</button> : <span />}<button className="submit-entry account-submit" type="submit" disabled={saving || ((kind === "transfer" || kind === "investment") && targetAccounts.length === 0) || (effectiveTransactionCurrency !== "CNY" && !market) || ((kind === "transfer" || kind === "investment") && targetCurrency !== sourceCurrency && !market)}>{saving ? "正在保存…" : editingTransaction ? "保存修改" : "完成记录"}</button></div></form></>}</section></div>}

    {accountOpen && <div className="modal-backdrop account-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setAccountOpen(false)}><section className="quick-sheet account-sheet" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" key={editingAccount?.id ?? "new-account"}><div className="sheet-handle" /><header className="sheet-header"><div><span className="kicker">ACCOUNT</span><h2 id="account-dialog-title">{editingAccount ? "编辑账户" : "新增账户"}</h2></div><button className="icon-button" onClick={() => setAccountOpen(false)} aria-label="关闭"><Icon name="close" /></button></header><form className="account-form" onSubmit={submitAccount}>
      <label className="account-name-field"><span>账户名称</span><input name="name" required maxLength={24} defaultValue={editingAccount?.name ?? ""} placeholder="例如：工商银行、Binance BTC" autoFocus /></label>
      <fieldset className="account-type-field"><legend>资产性质</legend><div className="asset-kind-options"><label><input type="radio" name="assetType" value="manual" checked={accountAssetType === "manual"} onChange={() => setAccountAssetType("manual")} /><span>现金 / 普通资产</span></label><label><input type="radio" name="assetType" value="crypto" checked={accountAssetType === "crypto"} onChange={() => setAccountAssetType("crypto")} /><span>Crypto 持仓</span></label></div></fieldset>
      {accountAssetType === "manual" && <fieldset className="account-type-field"><legend>账户类型</legend><div>{(["cash", "investment", "liability"] as AccountGroup[]).map((group) => <label key={group}><input type="radio" name="group" value={group} defaultChecked={(editingAccount?.group ?? "cash") === group} /><span>{({ cash: "现金账户", investment: "投资账户", liability: "负债账户" })[group]}</span></label>)}</div></fieldset>}
      <div className="account-form-grid"><label><span>{accountAssetType === "crypto" ? "持币数量" : "当前余额 / 市值 / 待还"}</span><div className="balance-input"><i>{accountAssetType === "crypto" ? cryptoAssets.find(([id]) => id === selectedCryptoId)?.[1] : unitSymbols[(editingAccount?.currency as DisplayUnit) || "CNY"]}</i><input name="balance" type="number" min="0" step={accountAssetType === "crypto" ? "any" : "0.01"} inputMode="decimal" required defaultValue={editingAccount?.balance ?? 0} /></div></label>{accountAssetType === "crypto" ? <><label><span>Crypto 币种</span><select name="assetId" value={selectedCryptoId} onChange={(event) => setSelectedCryptoId(event.target.value)}>{cryptoAssets.map(([id, symbol, name]) => <option value={id} key={id}>{symbol} · {name}</option>)}</select></label><label><span>当前总成本 · CNY</span><div className="balance-input"><i>¥</i><input name="costBasisCny" type="number" min="0" step="0.01" defaultValue={editingAccount?.costBasisCny ?? 0} /></div></label></> : <label><span>计量单位</span><select name="currency" defaultValue={editingAccount?.currency ?? "CNY"}><option value="CNY">CNY · 人民币</option><option value="USD">USD · 美元</option><option value="USDT">USDT · 泰达币</option></select></label>}</div>
      <fieldset className="color-field"><legend>账户颜色</legend><div>{accountColors.map((color) => <label key={color} style={{ background: color }}><input type="radio" name="color" value={color} defaultChecked={(editingAccount?.color ?? accountColors[0]) === color} /><span><Icon name="check" size={15} /></span></label>)}</div></fieldset><p className="account-form-note">{accountAssetType === "crypto" ? "初始持仓可直接校准；之后建议使用“记持仓”记录买卖，系统会维护平均成本、已实现和未实现盈亏。" : "直接修改余额属于账实校准，不会被计入收入或支出。跨币种账户会自动折算净资产。"}</p>{deleteConfirm && <div className="delete-confirm"><div><strong>将“{editingAccount?.name}”移入回收站？</strong><span>余额和历史关联都会保留，可以随时恢复。</span></div><button type="button" onClick={() => setDeleteConfirm(false)}>取消</button><button type="button" className="danger" onClick={deleteAccount} disabled={accountSaving}>移入回收站</button></div>}<div className="account-form-actions">{editingAccount && !deleteConfirm ? <button className="delete-account" type="button" onClick={() => setDeleteConfirm(true)}>删除账户</button> : <span />}<button className="submit-entry account-submit" type="submit" disabled={accountSaving}>{accountSaving ? "正在保存…" : editingAccount ? "保存修改" : "添加账户"}</button></div></form></section></div>}

    {planOpen && <div className="modal-backdrop account-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPlanOpen(false)}><section className="quick-sheet plan-sheet" role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title"><div className="sheet-handle" /><header className="sheet-header"><div><span className="kicker">{monthName} PLAN</span><h2 id="plan-dialog-title">编辑本月计划</h2></div><button className="icon-button" onClick={() => setPlanOpen(false)} aria-label="关闭"><Icon name="close" /></button></header><form className="account-form" onSubmit={submitPlan}><div className="account-form-grid"><label><span>月度总预算</span><div className="balance-input"><i>¥</i><input value={planBudgetDraft} onChange={(event) => setPlanBudgetDraft(event.target.value)} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" /></div></label><label><span>储蓄目标</span><div className="balance-input"><i>¥</i><input value={planSavingsDraft} onChange={(event) => setPlanSavingsDraft(event.target.value)} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" /></div></label></div><div className="plan-category-editor"><div className="plan-editor-heading"><div><span>分类预算</span><small>按你的生活方式自由拆分</small></div><button type="button" onClick={addPlanCategory}><Icon name="plus" size={14} />添加分类</button></div>{planCategoriesDraft.length ? <div className="plan-draft-list">{planCategoriesDraft.map((item) => <div key={item.key}><input value={item.category} onChange={(event) => setPlanCategoriesDraft((rows) => rows.map((row) => row.key === item.key ? { ...row, category: event.target.value } : row))} maxLength={12} placeholder="分类名称" /><div className="balance-input"><i>¥</i><input value={item.amount} onChange={(event) => setPlanCategoriesDraft((rows) => rows.map((row) => row.key === item.key ? { ...row, amount: event.target.value } : row))} type="number" min="0" step="0.01" placeholder="预算" /></div><button type="button" onClick={() => setPlanCategoriesDraft((rows) => rows.filter((row) => row.key !== item.key))}>移除</button></div>)}</div> : <div className="draft-empty">暂未设置分类预算，点击右上角添加。</div>}</div><div className="account-form-actions"><span /><button className="submit-entry account-submit" type="submit" disabled={planSaving}>{planSaving ? "正在保存…" : "保存本月计划"}</button></div></form></section></div>}

    {billOpen && <div className="modal-backdrop account-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setBillOpen(false)}><section className="quick-sheet account-sheet" role="dialog" aria-modal="true" aria-labelledby="bill-dialog-title" key={editingBill?.id ?? "new-bill"}><div className="sheet-handle" /><header className="sheet-header"><div><span className="kicker">RECURRING BILL</span><h2 id="bill-dialog-title">{editingBill ? "编辑固定账单" : "新增固定账单"}</h2></div><button className="icon-button" onClick={() => setBillOpen(false)} aria-label="关闭"><Icon name="close" /></button></header><form className="account-form" onSubmit={submitBill}>
      <label className="account-name-field"><span>账单名称</span><input name="title" required maxLength={24} defaultValue={editingBill?.title ?? ""} placeholder="例如：ChatGPT Plus、房租" autoFocus /></label>
      <div className="account-form-grid bill-form-grid"><label><span>周期金额</span><div className="balance-input"><i>{unitSymbols[billCurrency]}</i><input name="amount" type="number" min="0.01" step="any" required defaultValue={editingBill?.amount ?? ""} /></div></label><label><span>账单币种</span><select value={billCurrency} onChange={(event) => setBillCurrency(event.target.value as MoneyCurrency)}>{moneyCurrencies.map((currency) => <option value={currency.code} key={currency.code}>{currency.label}</option>)}</select></label><label><span>周期</span><select name="frequency" defaultValue={editingBill?.frequency ?? "monthly"}><option value="monthly">每月</option><option value="yearly">每年</option></select></label><label><span>扣款日</span><input name="dueDay" type="number" min="1" max="31" required defaultValue={editingBill?.dueDay ?? 1} /></label><label><span>下次扣款日期</span><input name="nextDueDate" type="date" defaultValue={editingBill?.nextDueDate ?? ""} /></label><label><span>试用结束日期</span><input name="trialEndsAt" type="date" defaultValue={editingBill?.trialEndsAt ?? ""} /></label><label><span>分类</span><input name="category" defaultValue={editingBill?.category ?? "固定支出"} maxLength={12} /></label><label><span>扣款账户</span><select name="accountId" defaultValue={editingBill?.accountId ?? ""}><option value="">暂不指定</option>{manualAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label></div>
      <p className="account-form-note">例如软件订阅每月 9.99 USD：保留原币价格与下一次扣款日；点“记账”即可把它作为模板填入流水。</p><label className="active-toggle"><input type="checkbox" name="active" defaultChecked={editingBill?.active ?? true} /><span><i /><strong>启用这个固定账单</strong><small>暂停后不计入周期支出合计</small></span></label>{billDeleteConfirm && <div className="delete-confirm"><div><strong>将“{editingBill?.title}”移入回收站？</strong><span>不会影响已经记录的历史流水，并且可以恢复。</span></div><button type="button" onClick={() => setBillDeleteConfirm(false)}>取消</button><button type="button" className="danger" onClick={deleteBill} disabled={billSaving}>移入回收站</button></div>}<div className="account-form-actions">{editingBill && !billDeleteConfirm ? <button className="delete-account" type="button" onClick={() => setBillDeleteConfirm(true)}>删除账单</button> : <span />}<button className="submit-entry account-submit" type="submit" disabled={billSaving}>{billSaving ? "正在保存…" : editingBill ? "保存修改" : "添加固定账单"}</button></div></form></section></div>}

    {cryptoOpen && <div className="modal-backdrop account-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCryptoOpen(false)}><section className="quick-sheet account-sheet crypto-sheet" role="dialog" aria-modal="true" aria-labelledby="crypto-dialog-title" key={editingCrypto?.id ?? "new-crypto"}><div className="sheet-handle" /><header className="sheet-header"><div><span className="kicker">CRYPTO OPERATION</span><h2 id="crypto-dialog-title">{editingCrypto ? "编辑 Crypto 操作" : "记录 Crypto 操作"}</h2></div><button className="icon-button" onClick={() => setCryptoOpen(false)} aria-label="关闭"><Icon name="close" /></button></header><div className="kind-tabs crypto-kind-tabs">{(["buy", "sell", "deposit", "withdrawal", "transfer"] as CryptoKind[]).map((item) => <button key={item} type="button" className={cryptoKind === item ? "active" : ""} onClick={() => setCryptoKind(item)}>{cryptoKindMeta[item].label}</button>)}</div><form className="account-form" onSubmit={submitCrypto}><div className="account-form-grid bill-form-grid"><label><span>持仓账户</span><select value={cryptoAccountId} onChange={(event) => setCryptoAccountId(Number(event.target.value))}>{cryptoAccounts.map((account) => <option value={account.id} key={account.id}>{account.name} · {account.assetSymbol}</option>)}</select></label><label><span>数量 · {selectedCryptoAccount?.assetSymbol || "Crypto"}</span><input name="quantity" type="number" min="0" step="any" required defaultValue={editingCrypto?.quantity ?? ""} /></label>{cryptoKind === "transfer" ? <label className="wide"><span>转入相同币种持仓</span><select value={cryptoTargetId} onChange={(event) => setCryptoTargetId(Number(event.target.value))}><option value="">请选择</option>{cryptoTransferTargets.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label> : <><label><span>{cryptoKind === "buy" || cryptoKind === "sell" ? "成交总额" : "取得成本（可选）"}</span><div className="balance-input"><i>{unitSymbols[cryptoCurrency]}</i><input name="amount" type="number" min="0" step="any" required={cryptoKind === "buy" || cryptoKind === "sell"} defaultValue={editingCrypto?.amount ?? ""} /></div></label><label><span>结算币种</span><select value={cryptoCurrency} onChange={(event) => { const currency = event.target.value as MoneyCurrency; setCryptoCurrency(currency); setCryptoFundingId(manualAccounts.find((account) => account.currency === currency)?.id ?? 0); }}>{moneyCurrencies.map((currency) => <option value={currency.code} key={currency.code}>{currency.label}</option>)}</select></label>{(cryptoKind === "buy" || cryptoKind === "sell") && <label><span>{cryptoKind === "buy" ? "付款账户" : "收款账户"}</span><select value={cryptoFundingId} onChange={(event) => setCryptoFundingId(Number(event.target.value))}><option value="">不联动资金账户</option>{cryptoFundingAccounts.map((account) => <option value={account.id} key={account.id}>{account.name} · {account.currency}</option>)}</select></label>}<label><span>手续费 · {cryptoCurrency}</span><input name="feeAmount" type="number" min="0" step="any" defaultValue={editingCrypto?.feeAmount ?? 0} /></label></>}<label><span>发生时间</span><input name="occurredAt" type="datetime-local" defaultValue={toLocalInput(editingCrypto?.occurredAt)} /></label><label className="wide"><span>备注</span><input name="note" maxLength={80} defaultValue={editingCrypto?.note ?? ""} placeholder="交易所、链或订单备注" /></label></div><p className="account-form-note">买卖会锁定 CNY 成本、汇率来源和时间，并更新平均成本与已实现盈亏；选择资金账户后，现金余额也会同步变动。</p>{cryptoDeleteConfirm && <div className="delete-confirm"><div><strong>移入回收站？</strong><span>持仓数量、成本、盈亏和资金账户余额会先还原，之后仍可恢复。</span></div><button type="button" onClick={() => setCryptoDeleteConfirm(false)}>取消</button><button type="button" className="danger" onClick={deleteCrypto} disabled={cryptoSaving}>移入回收站</button></div>}<div className="account-form-actions">{editingCrypto && !cryptoDeleteConfirm ? <button type="button" className="delete-account" onClick={() => setCryptoDeleteConfirm(true)}>删除操作</button> : <span />}<button className="submit-entry account-submit" type="submit" disabled={cryptoSaving || (cryptoKind === "transfer" && (!cryptoTargetId || cryptoTransferTargets.length === 0))}>{cryptoSaving ? "正在保存…" : editingCrypto ? "保存修改" : "完成记录"}</button></div></form></section></div>}

    {calculatorOpen && <div className="modal-backdrop calculator-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCalculatorOpen(false)}><section className="quick-sheet calculator-sheet" role="dialog" aria-modal="true" aria-labelledby="calculator-dialog-title"><div className="sheet-handle" /><header className="sheet-header"><div><span className="kicker">QUICK CALCULATOR</span><h2 id="calculator-dialog-title">随手计算</h2></div><button className="icon-button" onClick={() => setCalculatorOpen(false)} aria-label="关闭计算器"><Icon name="close" /></button></header><div className="calculator-display"><span>{calculatorStored !== null && calculatorOperator ? `${formatCalculatorValue(calculatorStored)} ${calculatorOperator}` : "FLOWLEDGER CALC"}</span><strong>{calculatorValue}</strong></div><div className="calculator-keypad"><button className="calc-key utility" onClick={resetCalculator}>AC</button><button className="calc-key utility" onClick={backspaceCalculator}>⌫</button><button className="calc-key utility" onClick={applyCalculatorPercent}>%</button><button className={`calc-key operator ${calculatorOperator === "÷" ? "active" : ""}`} onClick={() => chooseCalculatorOperator("÷")}>÷</button>{["7", "8", "9"].map((digit) => <button className="calc-key" key={digit} onClick={() => inputCalculatorDigit(digit)}>{digit}</button>)}<button className={`calc-key operator ${calculatorOperator === "×" ? "active" : ""}`} onClick={() => chooseCalculatorOperator("×")}>×</button>{["4", "5", "6"].map((digit) => <button className="calc-key" key={digit} onClick={() => inputCalculatorDigit(digit)}>{digit}</button>)}<button className={`calc-key operator ${calculatorOperator === "−" ? "active" : ""}`} onClick={() => chooseCalculatorOperator("−")}>−</button>{["1", "2", "3"].map((digit) => <button className="calc-key" key={digit} onClick={() => inputCalculatorDigit(digit)}>{digit}</button>)}<button className={`calc-key operator ${calculatorOperator === "+" ? "active" : ""}`} onClick={() => chooseCalculatorOperator("+")}>+</button><button className="calc-key zero" onClick={() => inputCalculatorDigit("0")}>0</button><button className="calc-key" onClick={inputCalculatorDecimal}>.</button><button className="calc-key equals" onClick={finishCalculator}>=</button></div><div className="calculator-actions"><button onClick={() => void copyCalculatorResult()}>复制结果</button><button className="primary" onClick={useCalculatorForTransaction}>用结果记账</button></div></section></div>}

    {dataOpen && <div className="modal-backdrop account-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDataOpen(false)}><section className="quick-sheet data-sheet" role="dialog" aria-modal="true" aria-labelledby="data-dialog-title"><div className="sheet-handle" /><header className="sheet-header"><div><span className="kicker">DATA & SAFETY</span><h2 id="data-dialog-title">数据与安全</h2></div><button className="icon-button" onClick={() => setDataOpen(false)} aria-label="关闭"><Icon name="close" /></button></header><div className="data-actions"><a href="/api/export" download><strong>导出 CSV</strong><span>导出当前有效流水，并包含锁定汇率、来源和时间</span></a><a href="/api/backup" download><strong>下载完整 JSON 备份</strong><span>保留账户、流水、计划、固定账单、Crypto 成本与回收站</span></a><label className={restoring ? "disabled" : ""}><strong>{restoring ? "正在恢复…" : "从 JSON 备份恢复"}</strong><span>兼容旧版备份；确认后以事务方式替换当前账本</span><input type="file" accept="application/json,.json" onChange={restoreBackup} disabled={restoring} /></label></div><div className="trash-section"><div className="trash-heading"><div><strong>回收站</strong><span>{trashItems.length ? `${trashItems.length} 个项目` : "目前为空"}</span></div><small>恢复流水时，相关账户余额和持仓也会一并还原</small></div>{trashItems.length > 0 && <div className="trash-list">{trashItems.map((item) => { const key = `${item.type}-${item.id}`; return <article key={key}><div><span>{({ account: "账户", transaction: "流水", crypto: "Crypto", bill: "固定账单" })[item.type]}</span><strong>{item.title}</strong><small>{item.detail} · {new Date(item.deletedAt).toLocaleDateString("zh-CN")}</small></div><button onClick={() => void restoreTrashItem(item)} disabled={trashBusy === key}>{trashBusy === key ? "处理中" : "恢复"}</button><button className="purge" onClick={() => void purgeTrashItem(item)} disabled={trashBusy === key}>永久删除</button></article>; })}</div>}</div><p className="data-warning">建议每月下载一次完整备份。CSV 适合查看与分析，JSON 才能完整恢复；永久删除无法撤销。</p></section></div>}

    {toast && <div className={`toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}><span>{toast.tone === "error" ? "!" : "✓"}</span>{toast.message}</div>}
  </main>;
}
