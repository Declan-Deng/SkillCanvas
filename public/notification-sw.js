self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => "focus" in client);
    if (existing) {
      await existing.focus();
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow("/");
  })());
});
