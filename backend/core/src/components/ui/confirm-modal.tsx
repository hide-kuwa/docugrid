import React from 'react';
import clsx from 'clsx';
import PrimaryButton from './primary-button';
import SecondaryButton from './secondary-button';

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  className,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className={clsx('bg-white dark:bg-gray-800 rounded-lg p-6 w-80', className)}
        onClick={e => e.stopPropagation()}
      >
        {title && <h3 className="text-lg font-medium mb-2">{title}</h3>}
        {message && <p className="mb-4">{message}</p>}
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onCancel}>{cancelLabel}</SecondaryButton>
          <PrimaryButton onClick={onConfirm}>{confirmLabel}</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
