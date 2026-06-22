import * as React from 'react';
import clsx from 'clsx';
import { useTheme } from '@/contexts/ThemeContext';
import { getThemeClass } from '@/utils/getThemeClass';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
  validate?: (v: string) => string | undefined
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, validate, onChange, ...props }, ref) => {
    const { theme } = useTheme()
    const [msg, setMsg] = React.useState(error)
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e)
      if (validate) {
        setMsg(validate(e.target.value))
      }
    }
    return (
      <div className="space-y-1">
        <input
          ref={ref}
          aria-invalid={!!msg}
          className={clsx(
            'border rounded px-2 py-1',
            getThemeClass(theme, {
              dark: 'bg-gray-800 text-white',
              glass: 'bg-white/30 backdrop-blur text-gray-900',
              pop: 'bg-pink-50 text-pink-800',
              default: 'bg-white text-gray-900',
            }),
            msg && 'border-red-500',
            className,
          )}
          onChange={handleChange}
          {...props}
        />
        {msg && <p className="text-xs text-red-600">{msg}</p>}
      </div>
    )
  },
)
Input.displayName = 'Input';
