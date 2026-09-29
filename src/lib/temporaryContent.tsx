"use client";

import { createContext, useContext, useEffect } from "react";

/**
 * Lets a widget report whether it currently has anything worth showing, so a
 * tile marked "temporary" (countdowns, notifications, sports, etc. — things
 * that aren't always-on like clock/weather) can hide itself entirely on the
 * live screen when empty instead of showing a permanent "nothing here" box.
 * A no-op outside a temporary tile, so widgets can call this unconditionally.
 */
const ReportContentContext = createContext<((hasContent: boolean) => void) | null>(null);

export function TemporaryContentProvider({
  onContentChange,
  children,
}: {
  onContentChange: (hasContent: boolean) => void;
  children: React.ReactNode;
}) {
  return <ReportContentContext.Provider value={onContentChange}>{children}</ReportContentContext.Provider>;
}

export function useReportContent(hasContent: boolean) {
  const report = useContext(ReportContentContext);
  useEffect(() => {
    report?.(hasContent);
  }, [hasContent, report]);
}
