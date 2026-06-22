import * as React from 'react';
import clsx from 'clsx';
import { useTheme } from '@/contexts/ThemeContext';
import { getThemeClass } from '@/utils/getThemeClass';

export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode;
  error?: string;
  warning?: string;
  wrapperClassName?: string;
}

const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, error, warning, wrapperClassName, className, id, ...props }, ref) => {
    const { theme } = useTheme();
    const inputId = id || (typeof label === 'string' ? label.toString() : undefined);

    return (
      <div className={clsx('space-y-1', wrapperClassName)}>
        <label
          htmlFor={inputId}
          className={clsx(
            'block text-sm font-medium',
            getThemeClass(theme, {
              dark: 'text-gray-300',
              glass: 'text-gray-700',
              pop: 'text-pink-700',
              default: 'text-gray-700',
            })
          )}
        >
          {label}
        </label>
        <input
          id={inputId}
          ref={ref}
          className={clsx(
            'mt-1 block w-full rounded-md shadow-sm p-2',
            getThemeClass(theme, {
              dark: 'border-gray-600 bg-gray-700 text-white',
              glass: 'border-white/40 bg-white/30 backdrop-blur text-gray-900',
              pop: 'border-pink-300 bg-pink-50 text-pink-800',
              default: 'border-gray-300 bg-white text-gray-900',
            }),
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
        {!error && warning && (
          <p className="mt-1 text-sm text-yellow-600">{warning}</p>
        )}
      </div>
    );
  }
);

InputField.displayName = 'InputField';

export default InputField;
