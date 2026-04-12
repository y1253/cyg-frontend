import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.brand}>CYG Finance</h1>
        <div className={styles.userInfo}>
          <span>{user?.name}</span>
          <span className={styles.role}>{user?.role}</span>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            Sign out
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <h2>Welcome back, {user?.name} 👋</h2>
        <p className={styles.subtitle}>Dashboard coming soon — clients, tasks, and more.</p>
      </main>
    </div>
  );
}
