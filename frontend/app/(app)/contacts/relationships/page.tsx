'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/page-header';
import Button from '@/components/ui/button';
import { contactsApi } from '@/lib/api';
import { ArrowLeftIcon, Squares2X2Icon, ListBulletIcon } from '@heroicons/react/24/outline';

type Node = { id: string; type: 'contact' | 'company'; label: string; company?: string | null; email?: string | null; phone?: string | null; jobTitle?: string | null };
type Edge = { source: string; target: string; type: 'company' | 'phone' | 'email' };
type Positioned = Node & { x: number; y: number };

const WIDTH = 1100;
const HEIGHT = 800;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const HUB_RADIUS = 300;
const SATELLITE_RADIUS = 80;

/** Deterministic radial layout: companies form an outer ring, each company's contacts orbit it, unlinked contacts get their own loose grid. No physics/simulation library needed. */
function layout(nodes: Node[], edges: Edge[]): Positioned[] {
  const companyNodes = nodes.filter((n) => n.type === 'company');
  const contactNodes = nodes.filter((n) => n.type === 'contact');
  const positions = new Map<string, { x: number; y: number }>();

  companyNodes.forEach((hub, i) => {
    const angle = (2 * Math.PI * i) / Math.max(companyNodes.length, 1);
    positions.set(hub.id, {
      x: CENTER.x + HUB_RADIUS * Math.cos(angle),
      y: CENTER.y + HUB_RADIUS * Math.sin(angle),
    });
  });

  const contactsByHub = new Map<string, string[]>();
  const linkedContactIds = new Set<string>();
  edges
    .filter((e) => e.type === 'company')
    .forEach((e) => {
      if (!contactsByHub.has(e.source)) contactsByHub.set(e.source, []);
      contactsByHub.get(e.source)!.push(e.target);
      linkedContactIds.add(e.target);
    });

  contactsByHub.forEach((contactIds, hubId) => {
    const hubPos = positions.get(hubId)!;
    contactIds.forEach((cid, i) => {
      const angle = (2 * Math.PI * i) / Math.max(contactIds.length, 1);
      positions.set(cid, {
        x: hubPos.x + SATELLITE_RADIUS * Math.cos(angle),
        y: hubPos.y + SATELLITE_RADIUS * Math.sin(angle),
      });
    });
  });

  // Contacts with no company go in a loose grid along the bottom.
  const unlinked = contactNodes.filter((n) => !linkedContactIds.has(n.id));
  const cols = Math.max(1, Math.ceil(Math.sqrt(unlinked.length)));
  unlinked.forEach((n, i) => {
    positions.set(n.id, {
      x: 60 + (i % cols) * 90,
      y: HEIGHT - 100 - Math.floor(i / cols) * 50,
    });
  });

  return nodes.map((n) => ({ ...n, ...(positions.get(n.id) || { x: CENTER.x, y: CENTER.y }) }));
}

export default function ContactRelationshipsPage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'graph' | 'tree'>('graph');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    contactsApi
      .getRelationships()
      .then((res) => {
        setNodes(res.nodes);
        setEdges(res.edges);
      })
      .catch((err) => setError(err.message || 'Failed to load contact relationships.'))
      .finally(() => setLoading(false));
  }, []);

  const positioned = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const posById = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned]);

  const crossLinkEdges = edges.filter((e) => e.type === 'phone' || e.type === 'email');
  const highlightedIds = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const related = new Set<string>([hoveredId]);
    edges.forEach((e) => {
      if (e.source === hoveredId) related.add(e.target);
      if (e.target === hoveredId) related.add(e.source);
    });
    return related;
  }, [hoveredId, edges]);

  // Tree view: group contacts by company, with badges for any phone/email cross-links.
  const tree = useMemo(() => {
    const groups = new Map<string, Node[]>();
    const noCompany: Node[] = [];
    const contactNodes = nodes.filter((n) => n.type === 'contact');
    contactNodes.forEach((n) => {
      if (n.company) {
        if (!groups.has(n.company)) groups.set(n.company, []);
        groups.get(n.company)!.push(n);
      } else {
        noCompany.push(n);
      }
    });
    const labelFor = (id: string) => nodes.find((n) => n.id === id)?.label || id;
    const crossLinksFor = (contactId: string) =>
      crossLinkEdges
        .filter((e) => e.source === contactId || e.target === contactId)
        .map((e) => ({ type: e.type, otherLabel: labelFor(e.source === contactId ? e.target : e.source) }));
    return { groups, noCompany, crossLinksFor };
  }, [nodes, crossLinkEdges]);

  return (
    <>
      <PageHeader
        title="Contact Relationships"
        description="Contacts connected by company, shared phone number, or shared email — orange links are a shared phone, blue links are a shared email."
        actions={
          <>
            <Link href="/contacts">
              <Button type="button" variant="secondary" size="sm">
                <ArrowLeftIcon className="h-4 w-4" /> Back to Contacts
              </Button>
            </Link>
            <Button type="button" variant={view === 'graph' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('graph')}>
              <Squares2X2Icon className="h-4 w-4" /> Graph
            </Button>
            <Button type="button" variant={view === 'tree' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('tree')}>
              <ListBulletIcon className="h-4 w-4" /> Tree
            </Button>
          </>
        }
      />

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      {loading && <p className="text-sm text-slate-500">Loading...</p>}

      {!loading && !error && nodes.length === 0 && (
        <p className="text-sm text-slate-500">No contacts yet — this fills in automatically as you add contacts.</p>
      )}

      {!loading && !error && nodes.length > 0 && view === 'graph' && (
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
          <svg width={WIDTH} height={HEIGHT} className="min-w-full">
            {/* Company -> contact lines */}
            {edges
              .filter((e) => e.type === 'company')
              .map((e, i) => {
                const s = posById.get(e.source);
                const t = posById.get(e.target);
                if (!s || !t) return null;
                const dim = hoveredId && !(highlightedIds.has(e.source) && highlightedIds.has(e.target));
                return <line key={`c-${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#e2e8f0" strokeWidth={1.5} opacity={dim ? 0.25 : 1} />;
              })}
            {/* Cross-links: shared phone (orange) / shared email (blue) */}
            {crossLinkEdges.map((e, i) => {
              const s = posById.get(e.source);
              const t = posById.get(e.target);
              if (!s || !t) return null;
              const dim = hoveredId && !(highlightedIds.has(e.source) && highlightedIds.has(e.target));
              return (
                <line
                  key={`x-${i}`}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={e.type === 'phone' ? '#f97316' : '#3b82f6'}
                  strokeWidth={2}
                  strokeDasharray="5,4"
                  opacity={dim ? 0.15 : 0.9}
                />
              );
            })}
            {/* Company hubs */}
            {positioned
              .filter((n) => n.type === 'company')
              .map((n) => (
                <g key={n.id} onMouseEnter={() => setHoveredId(n.id)} onMouseLeave={() => setHoveredId(null)} className="cursor-default">
                  <circle cx={n.x} cy={n.y} r={22} fill="#168eea" opacity={hoveredId && !highlightedIds.has(n.id) ? 0.25 : 1} />
                  <text x={n.x} y={n.y - 28} textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold">
                    {n.label}
                  </text>
                </g>
              ))}
            {/* Contacts */}
            {positioned
              .filter((n) => n.type === 'contact')
              .map((n) => (
                <g key={n.id} onMouseEnter={() => setHoveredId(n.id)} onMouseLeave={() => setHoveredId(null)} className="cursor-default">
                  <circle cx={n.x} cy={n.y} r={9} fill="#64748b" opacity={hoveredId && !highlightedIds.has(n.id) ? 0.2 : 1} />
                  <text x={n.x} y={n.y + 20} textAnchor="middle" className="fill-slate-600 text-[10px]" opacity={hoveredId && !highlightedIds.has(n.id) ? 0.2 : 1}>
                    {n.label}
                  </text>
                  {hoveredId === n.id && (n.email || n.phone) && (
                    <foreignObject x={n.x + 14} y={n.y - 10} width={200} height={60}>
                      <div className="rounded-md border border-slate-200 bg-white p-1.5 text-[10px] text-slate-600 shadow-lg">
                        {n.jobTitle && <p className="font-medium text-slate-800">{n.jobTitle}</p>}
                        {n.email && <p>{n.email}</p>}
                        {n.phone && <p>{n.phone}</p>}
                      </div>
                    </foreignObject>
                  )}
                </g>
              ))}
          </svg>
        </div>
      )}

      {!loading && !error && nodes.length > 0 && view === 'tree' && (
        <div className="space-y-4">
          {Array.from(tree.groups.entries()).map(([company, contacts]) => (
            <div key={company} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">{company}</p>
              <ul className="space-y-1.5 pl-3">
                {contacts.map((c) => {
                  const links = tree.crossLinksFor(c.id);
                  return (
                    <li key={c.id} className="text-sm text-slate-600">
                      <span className="font-medium text-slate-800">{c.label}</span>
                      {c.jobTitle && <span className="text-slate-400"> — {c.jobTitle}</span>}
                      {links.length > 0 && (
                        <span className="ml-2 space-x-1">
                          {links.map((l, i) => (
                            <span
                              key={i}
                              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${l.type === 'phone' ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}
                            >
                              shares {l.type} with {l.otherLabel}
                            </span>
                          ))}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {tree.noCompany.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">No company on file</p>
              <ul className="space-y-1.5 pl-3">
                {tree.noCompany.map((c) => {
                  const links = tree.crossLinksFor(c.id);
                  return (
                    <li key={c.id} className="text-sm text-slate-600">
                      <span className="font-medium text-slate-800">{c.label}</span>
                      {links.length > 0 && (
                        <span className="ml-2 space-x-1">
                          {links.map((l, i) => (
                            <span
                              key={i}
                              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${l.type === 'phone' ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}
                            >
                              shares {l.type} with {l.otherLabel}
                            </span>
                          ))}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
