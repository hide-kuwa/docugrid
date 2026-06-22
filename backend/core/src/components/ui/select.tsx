import * as React from 'react';
import clsx from 'clsx';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[]
  error?: string
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, error, ...props }, ref) => (
    <div className="space-y-1">
      <select
        ref={ref}
        aria-invalid={!!error}
        className={clsx(
          'border rounded px-2 py-1 bg-white dark:bg-gray-800',
          error && 'border-red-500',
          className,
        )}
        {...props}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
)
Select.displayName = 'Select';
