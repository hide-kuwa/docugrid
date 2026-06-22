import * as React from 'react';
import clsx from 'clsx';

export interface ToggleProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Toggle = React.forwardRef<HTMLInputElement, ToggleProps>(({ className, ...props }, ref) => (
  <label className="inline-flex items-center cursor-pointer">
    <input type="checkbox" ref={ref} className="sr-only peer" {...props} />
    <span
      className={clsx(
        'relative block w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-600 after:content-[""] after:absolute after:left-1 after:top-1 after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white',
        className
      )}
    />
  </label>
));
Toggle.displayName = 'Toggle';
