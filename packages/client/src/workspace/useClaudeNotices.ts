// Desktop notices now come from the server's notice list (notices/useNotices.ts); only the permission prompt stays here.
export function requestNoticePermission(): void {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
}
