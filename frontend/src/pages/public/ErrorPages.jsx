import { Link } from 'react-router-dom';
import { useAuth, homeFor } from '../../context/AuthContext';

const Page = ({ code, title, text, children }) => (
  <div className="mx-auto max-w-md py-16 text-center">
    <p className="font-display text-7xl font-extrabold text-jacaranda-200">{code}</p>
    <h1 className="mt-2 text-2xl font-bold">{title}</h1>
    <p className="mt-2 text-ink-500">{text}</p>
    <div className="mt-6 flex justify-center gap-2">{children}</div>
  </div>
);

const btn = 'rounded-lg bg-jacaranda-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-jacaranda-700';

export function NotFound() {
  return <Page code="404" title="We can’t find that page" text="The link may be old, or the page may have moved."><Link to="/" className={btn}>See all events</Link></Page>;
}

export function Unauthorized() {
  const { user } = useAuth();
  return (
    <Page code="403" title="This area isn’t for your account" text={user ? `You’re logged in as a ${user.role}, and this page is for a different role.` : 'Log in with the right account to see this page.'}>
      {user ? <Link to={homeFor(user)} className={btn}>Go to my dashboard</Link> : <Link to="/login" className={btn}>Log in</Link>}
    </Page>
  );
}
