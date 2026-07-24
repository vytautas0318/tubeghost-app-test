import * as React from 'react'
import { useEffect, useState } from 'react'
import { Sun, Moon, Check } from 'lucide-react'
import { useTheme } from '@/store/theme'
import { usePrefs, ACCENTS } from '@/store/prefs'
import { useWorkspace } from '@/store/workspace'
import { useHasPermission } from '@/lib/permissions'
import { Button, Toggle, Input, Select, SegmentedControl } from '@/components/ui'
import { updateWorkspaceGeneral, type LaunchBehavior } from '@/lib/settings'
import { Srow, type Toast } from './settingsCommon'
import { useSettingsData } from './useSettingsData'
import { DangerZone } from './DangerZone'

export function GeneralPanel({ onToast }: { onToast: Toast }): React.ReactElement {
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.set)
  const accent = usePrefs((s) => s.accent)
  const setAccent = usePrefs((s) => s.setAccent)
  const compact = usePrefs((s) => s.compactDensity)
  const setCompact = usePrefs((s) => s.setCompactDensity)

  const workspace = useWorkspace((s) => s.current)
  const wsId = workspace?.workspace_id ?? null
  const wsName = workspace?.workspace_name ?? 'Workspace'
  const canEdit = useHasPermission('workspace.edit_settings')
  const { settings, groups, reload } = useSettingsData(wsId)

  // Local editable copy of the workspace fields, seeded from the loaded row.
  const [name, setName] = useState('')
  const [launch, setLaunch] = useState<LaunchBehavior>('window')
  const [groupId, setGroupId] = useState<string>('none')
  const [lang, setLang] = useState('en')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!settings) return
    // Seed the local editable copy once the workspace row loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(settings.name)
    setLaunch(settings.default_launch_behavior)
    setGroupId(settings.default_group_id ?? 'none')
    setLang(settings.interface_language)
  }, [settings])

  const dirty =
    !!settings &&
    (name !== settings.name ||
      launch !== settings.default_launch_behavior ||
      groupId !== (settings.default_group_id ?? 'none') ||
      lang !== settings.interface_language)

  const saveWorkspace = async (): Promise<void> => {
    if (!wsId) return
    setSaving(true)
    try {
      await updateWorkspaceGeneral(wsId, {
        name: name.trim() || wsName,
        default_launch_behavior: launch,
        default_group_id: groupId === 'none' ? null : groupId,
        interface_language: lang
      })
      onToast('success', 'Workspace settings saved')
      reload()
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const wsDisabled = !canEdit
  const disabledTitle = !canEdit
    ? "You don't have permission to edit workspace settings"
    : undefined

  return (
    <>
      <div className="sec">
        <div className="sec-t">Appearance</div>
        <div className="sec-s">Customize how the browser looks on this device.</div>
        <Srow n="Theme" d="Light or dark interface.">
          <SegmentedControl
            value={theme}
            onChange={(v) => setTheme(v as 'light' | 'dark')}
            options={[
              { value: 'light', label: 'Light', icon: <Sun size={14} /> },
              { value: 'dark', label: 'Dark', icon: <Moon size={14} /> }
            ]}
          />
        </Srow>
        <Srow n="Accent color" d="Used for primary actions and highlights.">
          <div className="swatch">
            {ACCENTS.map((c) => (
              <div
                key={c.key}
                className={'sw-c' + (accent === c.key ? ' on' : '')}
                style={{ background: c.base }}
                onClick={() => setAccent(c.key)}
              />
            ))}
          </div>
        </Srow>
        <Srow n="Compact density" d="Tighter rows to fit more profiles on screen.">
          <Toggle checked={compact} onChange={setCompact} />
        </Srow>
      </div>

      <div className="sec">
        <div className="sec-t">Workspace</div>
        <div className="sec-s">Applies to everyone in {wsName}.</div>
        <div className="field">
          <label className="flabel">Workspace name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={wsDisabled}
            title={disabledTitle}
          />
        </div>
        <div
          className="field"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}
        >
          <div>
            <label className="flabel">Default launch behavior</label>
            <Select
              value={launch}
              onChange={(e) => setLaunch(e.target.value as LaunchBehavior)}
              disabled={wsDisabled}
              style={{ minWidth: '100%' }}
            >
              <option value="window">Open in new window</option>
              <option value="tab">Open in tab</option>
              <option value="headless">Open headless</option>
            </Select>
          </div>
          <div>
            <label className="flabel">Default group</label>
            <Select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              disabled={wsDisabled}
              style={{ minWidth: '100%' }}
            >
              <option value="none">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="flabel">Interface language</label>
          <Select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            disabled={wsDisabled}
            style={{ minWidth: '100%' }}
          >
            <option value="en">English (US)</option>
            <option value="es">Español</option>
            <option value="ru">Русский</option>
            <option value="zh">中文</option>
          </Select>
        </div>
        {canEdit && (
          <div className="foot-btns">
            <Button
              variant="primary"
              icon={<Check size={15} />}
              disabled={!dirty || saving}
              onClick={saveWorkspace}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        )}
      </div>

      <DangerZone wsId={wsId} wsName={wsName} canEdit={canEdit} onToast={onToast} />
    </>
  )
}
