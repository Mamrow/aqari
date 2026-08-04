import { useAppContext } from '../context/AppContext';
import MainTabs from './MainTabs';
import AdminTabs from './AdminTabs';

// Admin access comes from the server-side allowlist (isAdmin) — everything
// else is one unified experience now. There's no more buyer/agent split:
// any signed-in account can browse, save, and list.
export default function RootNavigator() {
  const { isAdmin } = useAppContext();

  if (isAdmin) return <AdminTabs />;
  return <MainTabs />;
}
