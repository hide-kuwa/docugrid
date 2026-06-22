'use client'
import * as React from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import clsx from 'clsx'
import { CheckCircle, AlertCircle, Info, TriangleAlert, Award, X } from 'lucide-react'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'achievement'

export interface AppToastProps extends ToastPrimitive.ToastProps {
  variant?: ToastVariant
  message: string
}

export function AppToast({ variant = 'info', message, ...props }: AppToastProps) {
  return (
    <ToastPrimitive.Root
      {...props}
      className={clsx(
        'flex items-center gap-2 rounded-md border shadow-lg bg-white dark:bg-gray-800 p-3',
        {
          'border-green-500': variant === 'success',
          'border-red-500': variant === 'error',
          'border-yellow-500': variant === 'warning',
          'border-blue-500': variant === 'info',
          'border-purple-500': variant === 'achievement',
        },
      )}
    >
      {variant === 'success' && <CheckCircle className="text-green-600 w-4 h-4" />}
      {variant === 'error' && <AlertCircle className="text-red-600 w-4 h-4" />}
      {variant === 'warning' && <TriangleAlert className="text-yellow-600 w-4 h-4" />}
      {variant === 'info' && <Info className="text-blue-600 w-4 h-4" />}
      {variant === 'achievement' && <Award className="text-purple-600 w-4 h-4" />}
      <ToastPrimitive.Title className="text-sm font-medium flex-1">
        {message}
      </ToastPrimitive.Title>
      <ToastPrimitive.Close aria-label="閉じる">
        <X className="w-4 h-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}

export const RadixToastProvider = ToastPrimitive.Provider
export const ToastViewport = ToastPrimitive.Viewport
