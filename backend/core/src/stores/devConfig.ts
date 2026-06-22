"use client";
import { useMemo } from "react";

type DevConfig = {
  themeColor: string;
};

type DevConfigState = {
  config: DevConfig;
};

const defaultState: DevConfigState = {
  config: {
    themeColor: "#1D4ED8",
  },
};

type Selector<T> = (state: DevConfigState) => T;

export function useDevConfig(): DevConfigState;
export function useDevConfig<T>(selector: Selector<T>): T;
export function useDevConfig<T>(selector?: Selector<T>) {
  return useMemo(() => {
    if (selector) {
      return selector(defaultState);
    }
    return defaultState;
  }, [selector]);
}
