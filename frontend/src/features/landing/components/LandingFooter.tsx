import React from "react";
import {
  MapPin,
  Facebook,
  Instagram,
  Twitter,
  Dribbble,
} from "lucide-react";
import MailFilledIcon from "@/components/ui/mail-filled-icon";
import TelephoneIcon from "@/components/ui/telephone-icon";
import WorldIcon from "@/components/ui/world-icon";
import { FooterBackgroundGradient, TextHoverEffect } from "@/components/ui/hover-footer";

export default function LandingFooter() {
  const footerLinks = [
    {
      title: "Platform",
      links: [
        { label: "eBPF Tracing Engine", href: "#features" },
        { label: "ML Anomaly Detection", href: "#features" },
        { label: "Autonomous K8s Remediation", href: "#features" },
        { label: "Service Topology Graph", href: "#architecture" },
      ],
    },
    {
      title: "Helpful Links",
      links: [
        { label: "SRE Runbooks", href: "/runbooks" },
        { label: "System Status", href: "/status-page" },
        {
          label: "Live Incident Sandbox",
          href: "#demo",
          pulse: true,
        },
      ],
    },
  ];

  const contactInfo = [
    {
      icon: <MailFilledIcon size={18} className="text-white" />,
      text: "support@astrawatch.io",
      href: "mailto:support@astrawatch.io",
    },
    {
      icon: <TelephoneIcon size={18} className="text-white" />,
      text: "+1 (800) 555-ASTRA",
      href: "tel:+18005552787",
    },
    {
      icon: <MapPin size={18} className="text-white" />,
      text: "San Francisco, CA",
    },
  ];

  const socialLinks = [
    { icon: <Facebook size={20} />, label: "Facebook", href: "#" },
    { icon: <Instagram size={20} />, label: "Instagram", href: "#" },
    { icon: <Twitter size={20} />, label: "Twitter", href: "#" },
    { icon: <Dribbble size={20} />, label: "Dribbble", href: "#" },
    { icon: <WorldIcon size={20} />, label: "Globe", href: "#" },
  ];

  return (
    <footer className="bg-black relative h-fit rounded-3xl overflow-hidden m-8 border border-neutral-800 text-slate-300">
      <div className="max-w-7xl mx-auto p-14 z-40 relative">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-8 lg:gap-16 pb-12">
          {/* Brand section */}
          <div className="flex flex-col space-y-4">
            <div className="flex items-center space-x-2">
              <span className="text-white text-3xl font-extrabold">
                &hearts;
              </span>
              <span className="text-white text-3xl font-bold">AstraWatch</span>
            </div>
            <p className="text-sm leading-relaxed text-slate-400">
              Autonomous Observability & AI K8s Auto-Healing Platform for high-scale microservices.
            </p>
          </div>

          {/* Footer link sections */}
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h4 className="text-white text-lg font-semibold mb-6">
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label} className="relative">
                    <a
                      href={link.href}
                      className="hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                    {link.pulse && (
                      <span className="absolute top-0 right-[-10px] w-2 h-2 rounded-full bg-white animate-pulse"></span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact section */}
          <div>
            <h4 className="text-white text-lg font-semibold mb-6">
              Contact Us
            </h4>
            <ul className="space-y-4">
              {contactInfo.map((item, i) => (
                <li key={i} className="flex items-center space-x-3">
                  {item.icon}
                  {item.href ? (
                    <a
                      href={item.href}
                      className="hover:text-white transition-colors"
                    >
                      {item.text}
                    </a>
                  ) : (
                    <span className="hover:text-white transition-colors">
                      {item.text}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <hr className="border-t border-gray-700 my-8" />

        {/* Footer bottom */}
        <div className="flex flex-col md:flex-row justify-between items-center text-sm space-y-4 md:space-y-0 text-slate-400">
          {/* Social icons */}
          <div className="flex space-x-6 text-slate-400">
            {socialLinks.map(({ icon, label, href }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="hover:text-white transition-colors"
              >
                {icon}
              </a>
            ))}
          </div>

          {/* Copyright */}
          <p className="text-center md:text-left">
            &copy; {new Date().getFullYear()} AstraWatch Inc. All rights reserved.
          </p>
        </div>
      </div>

      {/* Text hover effect */}
      <div className="lg:flex hidden h-[30rem] -mt-44 -mb-28">
        <TextHoverEffect text="AstraWatch" className="z-50" />
      </div>

      <FooterBackgroundGradient />
    </footer>
  );
}
