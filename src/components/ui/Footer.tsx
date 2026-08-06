import Link from "next/link";

type FooterLink = { href: string; label: string };
type FooterColumn = { heading: string; links: FooterLink[] };

const COLUMNS: FooterColumn[] = [
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    heading: "Creators",
    links: [
      { href: "/join-creator", label: "Join as Creator" },
      { href: "/career", label: "Join Us" },
    ],
  },
  {
    heading: "Brands",
    links: [
      { href: "/how-it-works", label: "How it Works" },
      { href: "/join-brand", label: "Join as Brand" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-surface-sunken">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="text-micro font-medium uppercase tracking-micro text-ink-muted">
                {col.heading}
              </h3>
              <ul className="mt-4 space-y-4">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-ink-muted transition-colors duration-fast hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
