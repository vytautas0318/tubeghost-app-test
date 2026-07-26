import * as React from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronRight, Users } from 'lucide-react'
import { Button } from '@/components/ui'
import { ToastView, useToast } from '@/components/Toast'
import { PoweredByTubeProxies } from '@/components/PoweredByTubeProxies'
import { listProfiles } from '@/lib/profiles'
import { listMyPhoneNumbers } from '@/lib/phone-numbers'
import { useWorkspace } from '@/store/workspace'
import { type PhoneNum, type ProfileOpt } from './phone/phoneData'
import { NumbersPanel } from './phone/NumbersPanel'
import { RecentSms } from './phone/RecentSms'

// Derive a display area label from the number's country/area code (best-effort;
// US +1 numbers show their 3-digit area code).
function areaOf(number: string): string {
  const digits = number.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4)
  if (digits.length === 10) return digits.slice(0, 3)
  return 'US'
}

export function Phone(): React.ReactElement {
  // Numbers are the current user's TubeProxies purchases, synced into this
  // project and read by matching the logged-in email (RLS, migration 0039).
  const [nums, setNums] = useState<PhoneNum[]>([])
  const [profileOpts, setProfileOpts] = useState<ProfileOpt[]>([])
  const workspaceId = useWorkspace((s) => s.current?.workspace_id ?? null)
  const { toast, show } = useToast()
  const navigate = useNavigate()

  // Load the user's own phone numbers (email-scoped by RLS).
  useEffect(() => {
    listMyPhoneNumbers()
      .then((rows) =>
        setNums(
          rows.map((r) => ({
            id: r.id,
            number: r.phone_number,
            area: areaOf(r.phone_number),
            profile: 'Unassigned',
            pl: null,
            code: null,
            from: null,
            tags: r.label ? [['neutral', r.label]] : undefined
          }))
        )
      )
      .catch(() => setNums([]))
  }, [])

  // Real workspace profiles for the "Assign to profile" popover.
  useEffect(() => {
    if (!workspaceId) return
    listProfiles(workspaceId)
      .then((rows) => setProfileOpts(rows.map((r) => ({ name: r.name, pl: null }))))
      .catch(() => setProfileOpts([]))
  }, [workspaceId])

  const active = nums.filter((n) => n.profile !== 'Unassigned').length
  const teamGap = Math.max(0, 5 - nums.length)

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="wrap">
        <div className="phead">
          <div>
            <h1>Google/YouTube US phone numbers</h1>
            <p style={{ maxWidth: '560px' }}>
              Real US non-VoIP numbers you own as long as you&apos;re subscribed — for ongoing 2FA
              and account recovery on YouTube, Gmail, and any service that needs a number.
            </p>
          </div>
          <div className="phead-actions">
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => window.open('https://dash.tubeproxies.com/phone-numbers', '_blank')}
            >
              Add numbers
            </Button>
          </div>
        </div>

        <div className="phone-summary">
          <div className="ps-stat">
            <div className="ps-k">Usage</div>
            <div className="ps-v">
              {active}
              <span className="ps-cap"> / {nums.length} active</span>
            </div>
          </div>
          <div className="ps-div" />
          <div className="ps-stat">
            <div className="ps-k">Next renewal</div>
            <div className="ps-v">{nums.length > 0 ? '—' : 'No subscription'}</div>
          </div>
          <div className="ps-div" />
          <div className="ps-stat">
            <div className="ps-k">Monthly cost</div>
            <div className="ps-v">
              $0.00<span className="ps-cap"> /mo</span>
            </div>
          </div>
          <PoweredByTubeProxies style={{ marginLeft: 'auto' }} />
        </div>

        <div className="phone-grid">
          <NumbersPanel nums={nums} setNums={setNums} profileOpts={profileOpts} show={show} />
          <RecentSms inbox={[]} onCopied={(val) => show('success', `Copied ${val}`)} />
        </div>

        <div className="phone-team">
          <span className="pt-ic">
            <Users size={18} />
          </span>
          <div className="pt-info">
            <div className="pt-title">Team sharing {teamGap > 0 ? '— locked' : '— unlocked'}</div>
            <div className="pt-sub">
              {teamGap > 0
                ? `Add ${teamGap} more numbers (5+ total) to unlock team sharing.`
                : 'Your team can share these numbers for verification.'}
            </div>
          </div>
          <span className="pt-link" onClick={() => navigate('/team/members')}>
            Manage on Members <ChevronRight size={14} />
          </span>
        </div>
      </div>
      <ToastView toast={toast} position="bottom-center" />
    </div>
  )
}
