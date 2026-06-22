import * as React from 'react';
import clsx from 'clsx';

export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode;
  direction?: 'row' | 'column';
  width?: 'sm' | 'md' | 'full';
  error?: string;
}

const widthMap = {
  sm: 'w-40',
  md: 'w-64',
  full: 'w-full',
};

const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  (
    {
      label,
      direction = 'column',
      width = 'full',
      error,
      className,
      required,
      ...props
    },
    ref
  ) => {
    const containerClass = clsx(
      direction === 'row' ? 'flex items-center space-x-2' : 'flex flex-col space-y-1',
      widthMap[width]
    );

    const inputClass = clsx(
      'flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50',
      error && 'border-red-500 focus:ring-red-500 focus:border-red-500',
      className
    );

    const labelNode = (
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
    );

    return (
      <div className={containerClass}>
        {labelNode}
        <div className={direction === 'row' ? 'flex-1' : undefined}>
          <input ref={ref} className={inputClass} required={required} {...props} />
          {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
        </div>
      </div>
    );
  }
);

InputField.displayName = 'InputField';

export default InputField;
