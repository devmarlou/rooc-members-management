import "./globals.css";
import "./admin.css";

export const metadata = {
  title: "ENCORE Guild Admin",
  description: "Member and auction dashboard for ENCORE",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
