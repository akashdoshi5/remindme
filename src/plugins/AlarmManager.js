// Capacitor plugin to check and request exact alarm permissions on Android 12+
import { registerPlugin } from '@capacitor/core';

const AlarmManager = registerPlugin('AlarmManager', {
    web: () => ({
        canScheduleExactAlarms: async () => ({ value: true }),
        requestExactAlarmPermission: async () => ({ value: true })
    })
});

export default AlarmManager;
