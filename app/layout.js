import "./globals.css";

export const metadata = {
  title: "ENCORE Guild Admin",
  description: "Member and auction dashboard for ENCORE guild admins"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
