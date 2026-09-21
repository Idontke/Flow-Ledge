"use client";

import { useEffect } from "react";

export default function LaunchController() {
  useEffect(() => {
    const launch = document.getElementById("flowledger-launch");
    if (!launch) return;

    let secondFrame = 0;
    let leaveTimer = 0;
    let removeTimer = 0;

    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        leaveTimer = window.setTimeout(() => {
          launch.classList.add("leaving");
          removeTimer = window.setTimeout(() => launch.remove(), 520);
        }, 520);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  return null;
}
