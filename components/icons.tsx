type IconProps = { name: string; size?: number };

export function Icon({ name, size = 20 }: IconProps) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9 20v-6h6v6"/></>,
    rooms: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h4v4H7zM13 9h4v4h-4zM7 15h10"/></>,
    project: <><path d="M4 21V8l8-5 8 5v13"/><path d="M8 21v-8h8v8M9 9h.01M15 9h.01"/></>,
    map: <><path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    task: <><path d="M9 11l2 2 4-4"/><path d="M21 12a9 9 0 1 1-5.3-8.2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    contract: <><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    finance: <><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 7v10"/></>,
    wrench: <><path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5L15 12l-3-3z"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.83 2.83-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.07V21h-4v-.09A1.65 1.65 0 0 0 8.6 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06-2.83-2.83.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.07-.4H3v-4h.09A1.65 1.65 0 0 0 4.6 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06 2.83-2.83.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .4-1.07V3h4v.09A1.65 1.65 0 0 0 15.4 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06 2.83 2.83-.06.06A1.65 1.65 0 0 0 19.4 9c.16.36.4.7.6 1 .23.35.4.72.4 1.13V13a1.65 1.65 0 0 0-.4 1c-.2.3-.44.64-.6 1z"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    chevron: <><path d="m9 18 6-6-6-6"/></>,
    'chevron-down': <><path d="m6 9 6 6 6-6"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M21 3v18"/></>,
    sparkles: <><path d="m12 3 1.2 3.2L16.5 7.5l-3.3 1.3L12 12l-1.2-3.2-3.3-1.3 3.3-1.3L12 3Z"/><path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/><path d="m5.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></>,
    arrowup: <><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></>,
    receipt: <><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3Z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    shield: <><path d="M12 3 4.5 6v5c0 4.6 3.1 8.8 7.5 10 4.4-1.2 7.5-5.4 7.5-10V6L12 3Z"/><path d="m9 12 2 2 4-4"/></>,
    meter: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M9 15h6"/><circle cx="12" cy="12" r="2"/></>,
    water: <><path d="M12 3s-5 5.7-5 10a5 5 0 0 0 10 0c0-4.3-5-10-5-10Z"/><path d="M9.5 14.5c.7 1 1.6 1.5 2.8 1.5"/></>,
    bolt: <><path d="M13 2 5 14h6l-1 8 8-12h-6z"/></>
  };
  return <svg {...common}>{paths[name] ?? paths.home}</svg>;
}
