import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/theme';
import { AuthProvider } from '../src/auth';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'AutoBody Intake' }} />
        <Stack.Screen name="i/[token]" options={{ title: 'Vehicle Intake' }} />
        <Stack.Screen name="portal/login" options={{ title: 'Shop Login' }} />
        <Stack.Screen name="portal/signup" options={{ title: 'Sign Up Your Shop' }} />
        <Stack.Screen name="portal/index" options={{ title: 'Dashboard' }} />
        <Stack.Screen name="portal/queue" options={{ title: "Today's Priorities" }} />
        <Stack.Screen name="portal/workflow" options={{ title: 'Repair Workflow' }} />
        <Stack.Screen name="portal/customers" options={{ title: 'Customers' }} />
        <Stack.Screen name="portal/parts" options={{ title: 'Parts Orders' }} />
        <Stack.Screen name="portal/schedule" options={{ title: 'Scheduling' }} />
        <Stack.Screen name="portal/reports" options={{ title: 'Reports' }} />
        <Stack.Screen name="portal/settings" options={{ title: 'Shop Settings' }} />
        <Stack.Screen name="portal/[id]" options={{ title: 'Submission' }} />
      </Stack>
    </AuthProvider>
  );
}





