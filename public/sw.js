self.addEventListener('push', function (event) {
    // This is for push messages, but we are using local notifications mostly.
    // If we were using FCM, we'd handle it here.
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    if (event.action === 'snooze') {
        // Handle Snooze Action
        // Ideally communicate with Client to snooze
        sendMessageToClients({ action: 'snooze', tag: event.notification.tag });
    } else if (event.action === 'done') {
        // Handle Done Action
        sendMessageToClients({ action: 'done', tag: event.notification.tag });
    } else {
        // Normal click: Open/Focus Window
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(function (clientList) {
                    if (clientList.length > 0) {
                        return clientList[0].focus();
                    }
                    if (clients.openWindow) {
                        return clients.openWindow('/');
                    }
                })
        );
    }
});

function sendMessageToClients(msg) {
    self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage(msg));
    });
}
