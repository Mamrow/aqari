import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AdminApprovalsStack from './AdminApprovalsStack';
import AdminPaymentsStack from './AdminPaymentsStack';
import SettingsStack from './SettingsStack';
import { tabIcon } from './tabIcon';
import { useT } from '../i18n/useT';

const Tab = createBottomTabNavigator();

export default function AdminTabs() {
  const t = useT();

  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarLabelPosition: 'below-icon' }}>
      <Tab.Screen
        name="Approvals"
        component={AdminApprovalsStack}
        options={{ title: t('tabApprovals'), tabBarIcon: tabIcon('checkmark-circle') }}
      />
      <Tab.Screen
        name="Payments"
        component={AdminPaymentsStack}
        options={{ title: t('tabPayments'), tabBarIcon: tabIcon('card') }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{ title: t('tabSettings'), tabBarIcon: tabIcon('settings') }}
      />
    </Tab.Navigator>
  );
}
