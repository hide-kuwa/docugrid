import * as React from 'react';
import clsx from 'clsx';

export const Slider = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>( 
  ({ className, ...props }, ref) => (
    <input
      type="range"
      ref={ref}
      className={clsx('w-full h-2 bg-gray-200 rounded-lg appearance-none', className)}
      {...props}
    />
  )
);
Slider.displayName = 'Slider';
