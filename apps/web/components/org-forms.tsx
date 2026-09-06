'use client';

import { useState, useTransition, type ReactNode } from 'react';
import {
  addEntity,
  addMember,
  createOrganization,
  removeEntity,
  removeMember,
  renameOrganization,
  switchOrganization,
  type ActionResult,
} from '@/lib/actions';
import { ROLE_LABEL, type Entity, type Org, type OrgMember, type Role } from '@/lib/org-types';

const input =
  'w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[14px] outline-none focus:border-[color:var(--brand-accent)]';
const primary =
  'rounded-lg bg-brand-accent px-3 py-2 text-[13.5px] font-[650] text-white disabled:opacity-60';
const ghost =
  'rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] font-[550] disabled:opacity-60';

function Note({ r }: { r: ActionResult | null }) {
  if (!r?.message) return null;
  return (
    <p className={`mt-2 text-[12.5px] ${r.ok ? 'text-good' : 'text-crit'}`}>{r.message}</p>
  );
}

/* ── 회사 만들기 ──────────────────────────────────────────────── */
export function CreateOrgForm({ compact }: { compact?: boolean }) {
  const [res, setRes] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) => start(async () => setRes(await createOrganization(fd)))}
      className="flex flex-col gap-2"
    >
      {!compact && (
        <label className="text-[12.5px] font-[650]" htmlFor="orgName">
          회사 이름
        </label>
      )}
      <input
        id="orgName"
        name="name"
        required
        autoFocus={!compact}
        placeholder="예) 샘플 그룹"
        className={input}
      />
      <button className={primary} disabled={pending}>
        {pending ? '만드는 중…' : '회사 만들기'}
      </button>
      <Note r={res} />
    </form>
  );
}

/* ── 회사 전환 ────────────────────────────────────────────────── */
export function OrgSwitcher({ orgs, current }: { orgs: Org[]; current: Org }) {
  const [pending, start] = useTransition();

  if (orgs.length <= 1) {
    return (
      <span className="text-[17px] font-[650] leading-tight">{current.name}</span>
    );
  }

  return (
    <select
      value={current.id}
      disabled={pending}
      onChange={(e) => start(() => switchOrganization(e.target.value).then(() => {}))}
      aria-label="회사 선택"
      className="-ml-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-[17px] font-[650] leading-tight hover:border-line hover:bg-surface-2"
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

/* ── 회사 이름 바꾸기 ─────────────────────────────────────────── */
export function RenameOrgForm({ org }: { org: Org }) {
  const [res, setRes] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) => start(async () => setRes(await renameOrganization(fd)))}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="orgId" value={org.id} />
      <div className="min-w-[200px] flex-1">
        <label className="text-[12.5px] font-[650]" htmlFor="rename">
          회사 이름
        </label>
        <input id="rename" name="name" defaultValue={org.name} required className={`${input} mt-1`} />
      </div>
      <button className={primary} disabled={pending}>
        저장
      </button>
      <div className="w-full">
        <Note r={res} />
      </div>
    </form>
  );
}

/* ── 법인 관리 ────────────────────────────────────────────────── */
export function EntityManager({ orgId, entities }: { orgId: string; entities: Entity[] }) {
  const [res, setRes] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <div>
      {entities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface-2 px-4 py-5 text-center text-[12.5px] leading-relaxed text-muted">
          아직 법인이 없습니다. 아래에서 추가하면 화면 상단 필터에 나타납니다.
        </div>
      ) : (
        <div className="scroll-x">
          <table className="min-w-[420px]">
            <thead>
              <tr>
                <th>법인</th>
                <th>줄임말</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entities.map((e) => (
                <tr key={e.id}>
                  <td className="font-[650]">{e.name}</td>
                  <td className="text-muted">{e.shortName ?? '-'}</td>
                  <td>
                    <form
                      action={(fd) => start(async () => setRes(await removeEntity(fd)))}
                      className="inline"
                    >
                      <input type="hidden" name="entityId" value={e.id} />
                      <button className={ghost} disabled={pending}>
                        내리기
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        action={(fd) => start(async () => setRes(await addEntity(fd)))}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="orgId" value={orgId} />
        <div className="min-w-[180px] flex-1">
          <label className="text-[12.5px] font-[650]" htmlFor="entName">
            법인 이름
          </label>
          <input
            id="entName"
            name="name"
            required
            placeholder="예) 법인A"
            className={`${input} mt-1`}
          />
        </div>
        <div className="w-[130px]">
          <label className="text-[12.5px] font-[650]" htmlFor="entShort">
            줄임말
          </label>
          <input id="entShort" name="shortName" placeholder="샘플" className={`${input} mt-1`} />
        </div>
        <button className={primary} disabled={pending}>
          추가
        </button>
      </form>
      <Note r={res} />
    </div>
  );
}

/* ── 멤버 관리 ────────────────────────────────────────────────── */
export function MemberManager({
  orgId,
  members,
  myRole,
  myEmail,
}: {
  orgId: string;
  members: OrgMember[];
  myRole: Role;
  myEmail: string | null;
}) {
  const [res, setRes] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const canManage = myRole === 'owner' || myRole === 'manager';

  return (
    <div>
      <div className="scroll-x">
        <table className="min-w-[420px]">
          <thead>
            <tr>
              <th>이메일</th>
              <th>역할</th>
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId}>
                <td>
                  {m.email}
                  {m.email === myEmail && <span className="ml-1.5 text-[11px] text-muted">(나)</span>}
                </td>
                <td className="text-muted">{ROLE_LABEL[m.role]}</td>
                {canManage && (
                  <td>
                    {m.email !== myEmail && (
                      <form
                        action={(fd) => start(async () => setRes(await removeMember(fd)))}
                        className="inline"
                      >
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <button className={ghost} disabled={pending}>
                          내보내기
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <>
          <form
            action={(fd) => start(async () => setRes(await addMember(fd)))}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="orgId" value={orgId} />
            <div className="min-w-[200px] flex-1">
              <label className="text-[12.5px] font-[650]" htmlFor="memEmail">
                이메일
              </label>
              <input
                id="memEmail"
                name="email"
                type="email"
                required
                placeholder="teammate@company.com"
                className={`${input} mt-1`}
              />
            </div>
            <div className="w-[120px]">
              <label className="text-[12.5px] font-[650]" htmlFor="memRole">
                역할
              </label>
              <select id="memRole" name="role" defaultValue="staff" className={`${input} mt-1`}>
                <option value="manager">관리자</option>
                <option value="staff">담당자</option>
                <option value="viewer">조회만</option>
              </select>
            </div>
            <button className={primary} disabled={pending}>
              추가
            </button>
          </form>
          <Note r={res} />
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
            상대가 <b>먼저 이 서비스에 로그인해 가입</b>해 있어야 추가할 수 있습니다. 초대 메일
            발송은 아직 없습니다.
          </p>
        </>
      )}
    </div>
  );
}

export function SettingsCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[16px] border border-line bg-surface-1 px-4 py-4 sm:px-[18px]">
      <h2 className="text-[14px] font-[650] leading-tight">{title}</h2>
      {sub && <p className="mt-0.5 mb-3 text-[12px] text-muted">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </section>
  );
}
