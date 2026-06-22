"use client";
import * as React from "react";
import clsx from "clsx";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const baseClasses =
  "inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:pointer-events-none disabled:opacity-50";

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, children, type = "button", ...rest }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...rest,
        className: clsx(baseClasses, className, children.props.className),
        ref,
      } as Record<string, unknown>);
    }

    return (
      <button
        ref={ref}
        type={type}
        className={clsx(baseClasses, className)}
        {...rest}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
