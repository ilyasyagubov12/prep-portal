"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const BASE_TITLE = "Victory College";

const TITLE_RULES: Array<[RegExp, string]> = [
  [/^\/login(\/|$)/, "Login"],
  [/^\/home(\/|$)/, "Home"],
  [/^\/courses(\/|$)/, "Courses"],
  [/^\/practice\/modules(\/|$)/, "Practice Test"],
  [/^\/practice\/mock-exams(\/|$)/, "Mock Exams"],
  [/^\/practice\/questions(\/|$)/, "Question Bank"],
  [/^\/vocab(\/|$)/, "Vocab"],
  [/^\/settings(\/|$)/, "Settings"],
  [/^\/score-report(\/|$)/, "Score Report"],
  [/^\/dashboard(\/|$)/, "Dashboard"],
];

function getTitle(pathname: string) {
  if (!pathname || pathname === "/") return BASE_TITLE;
  for (const [rule, title] of TITLE_RULES) {
    if (rule.test(pathname)) return `${title} | ${BASE_TITLE}`;
  }
  return BASE_TITLE;
}

export default function TitleSetter() {
  const pathname = usePathname();

  useEffect(() => {
    document.title = getTitle(pathname || "/");
  }, [pathname]);

  return null;
}
