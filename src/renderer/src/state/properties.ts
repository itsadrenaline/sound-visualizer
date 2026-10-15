/**
 * Property descriptors for the inspector.
 *
 * Instead of hand-building a form for fixtures, we describe each editable
 * property once: its label, type, limits, and how to read and write it.
 * The Inspector then draws a form for whatever is selected, including several
 * fixtures at once.
 */
import type { Fixture } from '../model/project'
import { listFixtureTypes } from '../model/fixtureTypes'

interface Base {
  key: string
  label: string
  /** Shown under the field. */
  hint?: string
}

export type PropertyDescriptor =
  | (Base & { kind: 'text'; get(f: Fixture): string; set(f: Fixture, v: string): Fixture })
  | (Base & {
      kind: 'number'
      min: number
      max: number
      step: number
      unit?: string
      get(f: Fixture): number
      set(f: Fixture, v: number): Fixture
    })
  | (Base & { kind: 'boolean'; get(f: Fixture): boolean; set(f: Fixture, v: boolean): Fixture })
  | (Base & {
      kind: 'select'
      options: Array<{ value: string; label: string }>
      get(f: Fixture): string
      set(f: Fixture, v: string): Fixture
    })

const axis = (index: 0 | 1 | 2, label: string, min: number, max: number): PropertyDescriptor => ({
  key: `position-${index}`,
  label,
  kind: 'number',
  min,
  max,
  step: 0.1,
  unit: 'm',
  get: (f) => f.position[index],
  set: (f, v) => {
    const position = [...f.position] as Fixture['position']
    position[index] = v
    return { ...f, position }
  }
})

export const FIXTURE_PROPERTIES: Array<{ section: string; properties: PropertyDescriptor[] }> = [
  {
    section: 'Fixture',
    properties: [
      { key: 'name', label: 'Name', hint: 'What this fixture is called in the lists and the DMX map', kind: 'text', get: (f) => f.name, set: (f, name) => ({ ...f, name }) },
      {
        key: 'type',
        label: 'Type',
        hint: 'The kind of fixture and its DMX mode: how many channels and what each one does',
        kind: 'select',
        // A getter, so types imported later (from SoundSwitch) show up too.
        get options() {
          return listFixtureTypes().map((t) => ({ value: t.id, label: t.name }))
        },
        get: (f) => f.typeId,
        set: (f, typeId) => ({ ...f, typeId })
      }
    ]
  },
  {
    section: 'Patch',
    properties: [
      {
        key: 'universe',
        label: 'Universe',
        kind: 'number',
        min: 1,
        max: 32768,
        step: 1,
        hint: 'Numbered like SoundSwitch: Universe 1 is Art-Net universe 0',
        get: (f) => f.universe + 1,
        set: (f, universe) => ({ ...f, universe: universe - 1 })
      },
      {
        key: 'address',
        label: 'Address',
        hint: 'The first DMX channel it listens on. Copies that share an address mirror each other on purpose',
        kind: 'number',
        min: 1,
        max: 512,
        step: 1,
        get: (f) => f.address,
        set: (f, address) => ({ ...f, address })
      },
      {
        key: 'group',
        label: 'Group',
        kind: 'number',
        min: 0,
        max: 16,
        step: 1,
        hint: '0 = no group. Fixtures from SoundSwitch take their group from SoundSwitch.',
        get: (f) => f.group ?? 0,
        set: (f, group) => ({ ...f, group: group || undefined })
      }
    ]
  },
  {
    section: 'Placement',
    properties: [
      axis(0, 'X (left/right)', -20, 20),
      axis(1, 'Y (height)', 0, 15),
      axis(2, 'Z (up/downstage)', -20, 20),
      {
        key: 'mounting',
        label: 'Mounting',
        hint: 'Hanging: upside down under a truss. Upright: on a totem, a stand or the floor',
        kind: 'select',
        options: [
          { value: 'hanging', label: 'Hanging (truss)' },
          { value: 'floor', label: 'Upright (totem, stand, floor)' }
        ],
        get: (f) => f.mounting,
        set: (f, mounting) => ({ ...f, mounting: mounting as Fixture['mounting'] })
      },
      {
        key: 'rotation',
        label: 'Rotation',
        kind: 'number',
        min: -180,
        max: 180,
        step: 5,
        unit: '°',
        hint: 'Turns the whole fixture around its vertical axis',
        get: (f) => f.rotation ?? 0,
        set: (f, rotation) => ({ ...f, rotation })
      },
      {
        key: 'aimTilt',
        label: 'Aim tilt',
        kind: 'number',
        min: -90,
        max: 90,
        step: 1,
        unit: '°',
        hint: 'Fixed aim for fixtures that cannot move',
        get: (f) => f.aimTilt,
        set: (f, aimTilt) => ({ ...f, aimTilt })
      }
    ]
  },
  {
    section: 'Movement',
    properties: [
      {
        key: 'invertPan',
        label: 'Invert pan',
        kind: 'boolean',
        hint: 'Same DMX, opposite direction: for mirrored pairs',
        get: (f) => !!f.invertPan,
        set: (f, invertPan) => ({ ...f, invertPan })
      },
      {
        key: 'invertTilt',
        label: 'Invert tilt',
        hint: 'Same DMX, tilts the opposite way: for fixtures mounted the other way round',
        kind: 'boolean',
        get: (f) => !!f.invertTilt,
        set: (f, invertTilt) => ({ ...f, invertTilt })
      }
    ]
  }
]
