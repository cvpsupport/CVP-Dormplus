'use client';

import { useEffect } from 'react';
import { Icon } from '@/components/icons';

export function Modal({ open, title, subtitle, onClose, children }: { open: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal-card" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
      <div className="modal-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="ปิด">×</button>
      </div>
      {children}
    </div>
  </div>;
}

export function FormActions({ saving, onCancel, saveLabel = 'บันทึก' }: { saving?: boolean; onCancel: () => void; saveLabel?: string }) {
  return <div className="form-actions">
    <button type="button" className="outline-btn" onClick={onCancel}>ยกเลิก</button>
    <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'กำลังบันทึก...' : saveLabel}</button>
  </div>;
}

export function Toast({ message, tone = 'success', onClose }: { message: string | null; tone?: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return <div className={`toast ${tone}`}><Icon name={tone === 'success' ? 'check' : 'bell'} size={17}/><span>{message}</span><button onClick={onClose}>×</button></div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="crud-empty"><div className="crud-empty-icon"><Icon name="project" size={26}/></div><b>{title}</b><span>{description}</span>{action}</div>;
}

export function CrudMenu({ onEdit, onDelete, canEdit = true, canDelete = true }: { onEdit: () => void; onDelete: () => void; canEdit?: boolean; canDelete?: boolean }) {
  if (!canEdit && !canDelete) return null;
  return <div className="crud-actions">{canEdit && <button type="button" onClick={onEdit}>แก้ไข</button>}{canDelete && <button type="button" className="danger-link" onClick={onDelete}>ลบ</button>}</div>;
}
