import { Component } from 'react';

/** Last line of defence: a crash in any page shows this instead of a blank screen. */
export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <h1 className="text-3xl font-bold">Something broke on our side</h1>
          <p className="mt-2 text-ink-500">Your data is safe. Reload the page to carry on.</p>
          <button onClick={() => window.location.assign('/')} className="mt-5 rounded-lg bg-jacaranda-600 px-4 py-2.5 text-sm font-semibold text-ink-50">Back to events</button>
        </div>
      </div>
    );
  }
}