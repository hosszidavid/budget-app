import "./globals.css";

export const metadata = {
  title: "Budget",
  description: "Personal budgeting database",
};

const themeScript = `
(() => {
  try {
    const saved = localStorage.getItem('budget-theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = saved === 'dark' || (!saved && systemDark) ? 'dark' : 'light';
  } catch (_) {
    document.documentElement.dataset.theme = 'light';
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hu" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
