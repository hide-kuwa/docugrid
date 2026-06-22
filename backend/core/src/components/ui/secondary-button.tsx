"use client";
import * as React from 'react';
import clsx from 'clsx';
import { useDevConfig } from '@/stores/devConfig';
import { useTheme } from '@/contexts/ThemeContext';
import { getThemeClass } from '@/utils/getThemeClass';

export interface SecondaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const SecondaryButton = React.forwardRef<HTMLButtonElement, SecondaryButtonProps>(
  ({ className, children, style, ...props }, ref) => {
    const themeColor = useDevConfig((s) => s.config.themeColor);
    const { theme } = useTheme();
    return (
      <button
        ref={ref}
        style={{ color: themeColor, borderColor: themeColor, ...style }}
        className={clsx(
          'font-semibold py-2 px-4 rounded border disabled:opacity-50',
          getThemeClass(theme, {
            dark: 'bg-transparent text-white',
            glass: 'bg-white/30 backdrop-blur text-gray-900',
            pop: 'bg-pink-50 text-pink-700',
            default: 'bg-transparent text-blue-700',
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

SecondaryButton.displayName = 'SecondaryButton';

export default SecondaryButton;
