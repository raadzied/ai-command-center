import React from 'react';
import type { AssistantPermission, AssistantSettings } from './window';

interface PermissionPanelProps {
  open: boolean;
  settings: AssistantSettings | null;
  error: string | null;
  onPermissionChange: (
    permission: AssistantPermission,
    enabled: boolean,
  ) => void;
}

const PERMISSIONS: ReadonlyArray<{
  id: AssistantPermission;
  title: string;
  description: string;
  available: boolean;
}> = [
  { id: 'file_read', title: 'قراءة ملفات المشروع', description: 'فتح الملفات وسرد المجلدات داخل المشروع.', available: true },
  { id: 'file_write', title: 'إنشاء وتعديل الملفات', description: 'يتطلب وضع البناء وموافقتك قبل كل تغيير.', available: true },
  { id: 'file_delete', title: 'حذف الملفات', description: 'تُفعّل عند إضافة أداة الحذف.', available: false },
  { id: 'terminal', title: 'أوامر الطرفية', description: 'تُفعّل عند إضافة أداة الطرفية؛ الأوامر الخطرة تظل محجوبة.', available: false },
  { id: 'http_request', title: 'طلبات الشبكة للأدوات', description: 'تُفعّل عند ربط أداة أو خادم MCP.', available: false },
  { id: 'git_operation', title: 'عمليات Git', description: 'تُفعّل عند إضافة أداة Git.', available: false },
];

export function PermissionPanel({
  open,
  settings,
  error,
  onPermissionChange,
}: PermissionPanelProps): React.JSX.Element | null {
  if (!open) return null;

  return (
    <aside className="permissions-panel" aria-label="إعدادات الصلاحيات">
      <div className="permissions-heading">
        <div>
          <strong>الصلاحيات</strong>
          <p>
            {!settings
              ? 'جارٍ تحميل الوضع…'
              : settings.mode === 'planning'
                ? 'الوضع الحالي: التخطيط — بلا تنفيذ'
                : 'الوضع الحالي: البناء'}
          </p>
        </div>
      </div>

      {error && <div className="permissions-error">{error}</div>}
      {!settings ? (
        <p className="permissions-empty">جارٍ تحميل الإعدادات…</p>
      ) : (
        <div className="permissions-list">
          {PERMISSIONS.map((permission) => {
            const enabled = settings.permissions[permission.id];
            return (
              <div className="permission-row" key={permission.id}>
                <div>
                  <strong>{permission.title}</strong>
                  <p>{permission.description}</p>
                </div>
                <button
                  type="button"
                  className={`permission-toggle ${enabled ? 'enabled' : ''}`}
                  role="switch"
                  aria-checked={enabled}
                  aria-label={permission.title}
                  disabled={!permission.available}
                  onClick={() => onPermissionChange(permission.id, !enabled)}
                >
                  {enabled ? 'مفعّل' : permission.available ? 'موقوف' : 'لاحقًا'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="permissions-note">
        أدوات MCP والتحكم بالمتصفح لا تُفعّل قبل ربط خادم موثوق لها.
      </div>
    </aside>
  );
}
