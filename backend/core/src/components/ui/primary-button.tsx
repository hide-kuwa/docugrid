"use client";
import * as React from 'react';
import clsx from 'clsx';
import { useDevConfig } from '@/stores/devConfig';
import { useTheme } from '@/contexts/ThemeContext';
import { getThemeClass } from '@/utils/getThemeClass';

export interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const PrimaryButton = React.forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  ({ className, children, style, ...props }, ref) => {
    const themeColor = useDevConfig((s) => s.config.themeColor);
    const { theme } = useTheme();
    return (
      <button
        ref={ref}
        style={{ backgroundColor: themeColor, ...style }}
        className={clsx(
          'font-semibold py-2 px-4 rounded disabled:opacity-50',
          getThemeClass(theme, {
            dark: 'bg-gray-900 text-white',
            glass: 'bg-white/30 backdrop-blur border border-white/30 text-gray-900',
            pop: 'bg-pink-500 text-white',
            default: 'bg-blue-600 text-white',
          }),
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

PrimaryButton.displayName = 'PrimaryButton';

export default PrimaryButton;
