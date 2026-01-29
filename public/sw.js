self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    // Broadcast the action to the window client
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length > 0) {
                const client = clientList[0];
                client.postMessage({
                    type: 'NOTIFICATION_ACTION',
                    action: event.action, // 'snooze' or 'done'
                    tag: event.notification.tag,
                    data: event.notification.data
                });
                if (client.focus) return client.focus();
            }
        })
    );
});
