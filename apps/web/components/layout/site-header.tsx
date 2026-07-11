"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { projectConfig } from "@/config/project.config";
import { protocolDeployed } from "@/lib/deployment-manifest";
import { useAdminAccess } from "@/features/admin/admin-hooks";
import { IconButton } from "@/components/ui/button";
import { WalletButton } from "@/components/wallet/wallet-button";
import styles from "./site-layout.module.css";

const publicLinks = [
  { href: "/", label: "Search" },
  { href: "/market", label: "Market" },
  { href: "/me", label: "Me" },
  { href: "/developers", label: "Developers" },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const adminAccess = useAdminAccess();
  const links = adminAccess.isAuthorized
    ? [...publicLinks, { href: projectConfig.admin.path, label: "Admin" }]
    : publicLinks;

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.logo} aria-label={`${projectConfig.brand.name} home`}>
          <Image src={projectConfig.brand.logo} alt={projectConfig.brand.name} width={156} height={40} priority />
        </Link>
        <nav id="primary-navigation" className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`} aria-label="Primary navigation">
          {links.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <div className={styles.networkState} title={protocolDeployed ? "Service active" : "Service not yet available"}>
            <span className={protocolDeployed ? styles.liveDot : styles.pendingDot} />
            <span>{projectConfig.chain.name}</span>
          </div>
          <WalletButton />
          <IconButton
            label={menuOpen ? "Close navigation" : "Open navigation"}
            className={styles.menuButton}
            aria-controls="primary-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </IconButton>
        </div>
      </div>
    </header>
  );
}
