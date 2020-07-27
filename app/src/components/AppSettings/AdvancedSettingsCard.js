// @flow
// app info card with version and updated
import * as React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { withRouter } from 'react-router-dom'
import startCase from 'lodash/startCase'

import {
  getUseTrashSurfaceForTipCal,
  getDevtoolsEnabled,
  getFeatureFlags,
  getUpdateChannel,
  getUpdateChannelOptions,
  updateConfigValue,
  toggleUseTrashSurfaceForTipCal,
  toggleDevtools,
  toggleDevInternalFlag,
  DEV_INTERNAL_FLAGS,
} from '../../config'

import { Card, LabeledToggle, LabeledSelect } from '@opentrons/components'

import type { ContextRouter } from 'react-router-dom'
import type { DropdownOption } from '@opentrons/components'
import type { State, Dispatch } from '../../types'
import type { Config, DevInternalFlag, UpdateChannel } from '../../config/types'

const TITLE = 'Advanced Settings'

const USE_TRASH_SURFACE_TIP_CAL_LABEL =
  'Use Trash Bin surface for tip calibration'
const USE_TRASH_SURFACE_TIP_CAL_BODY =
  "Tip length calibration should be performed using a Calibration Block. If you don't have one, use this option"

const UPDATE_CHANNEL_LABEL = 'Update Channel'
const UPDATE_CHANNEL_BODY =
  'Sets the update channel of your app. "Stable" receives the latest stable releases. "Beta" is updated more frequently so you can try out new features, but the releases may be less well tested than "Stable".'

const ENABLE_DEV_TOOLS_LABEL = 'Enable Developer Tools'
const ENABLE_DEV_TOOLS_BODY =
  "Requires restart. Turns on the app's developer tools, which provide access to the inner workings of the app and additional logging."

type Props = {|
  ...ContextRouter,
  checkUpdate: () => mixed,
|}

export const AdvancedSettingsCard: React.AbstractComponent<
  $Diff<Props, ContextRouter>
> = withRouter(AdvancedSettingsCardComponent)

function AdvancedSettingsCardComponent(props: Props) {
  const useTrashSurfaceForTipCal = useSelector(getUseTrashSurfaceForTipCal)
  const devToolsOn = useSelector(getDevtoolsEnabled)
  const devInternalFlags = useSelector(getFeatureFlags)
  const channel = useSelector(getUpdateChannel)
  const channelOptions = useSelector(getUpdateChannelOptions)
  const dispatch = useDispatch()

  const toggleUseTrashForTipCal = React.useCallback(
    () => dispatch(toggleUseTrashSurfaceForTipCal()),
    [dispatch]
  )
  const toggleDevtools = React.useCallback(() => dispatch(toggleDevtools()), [
    dispatch,
  ])
  const toggleDevInternalFlag = React.useCallback(
    (flag: DevInternalFlag) => dispatch(toggleDevInternalFlag(flag)),
    [dispatch]
  )
  const handleChannel = React.useCallback(
    event => dispatch(updateConfigValue('update.channel', event.target.value)),
    [dispatch]
  )

  React.useEffect(props.checkUpdate, [channel])

  return (
    <Card title={TITLE}>
      {useTrashSurfaceForTipCal != null && (
        <LabeledToggle
          label={USE_TRASH_SURFACE_TIP_CAL_LABEL}
          toggledOn={useTrashSurfaceForTipCal}
          onClick={toggleUseTrashForTipCal}
        >
          <p>{USE_TRASH_SURFACE_TIP_CAL_BODY}</p>
        </LabeledToggle>
      )}
      <LabeledSelect
        label={UPDATE_CHANNEL_LABEL}
        value={channel}
        options={channelOptions}
        onChange={handleChannel}
      >
        <p>{UPDATE_CHANNEL_BODY}</p>
      </LabeledSelect>
      <LabeledToggle
        label={ENABLE_DEV_TOOLS_LABEL}
        toggledOn={devToolsOn}
        onClick={toggleDevtools}
      >
        <p>{ENABLE_DEV_TOOLS_BODY}</p>
      </LabeledToggle>
      {devToolsOn &&
        DEV_INTERNAL_FLAGS.map(flag => (
          <LabeledToggle
            key={flag}
            label={`__DEV__ ${startCase(flag)}`}
            toggledOn={Boolean(devInternalFlags?.[flag])}
            onClick={() => toggleDevInternalFlag(flag)}
          />
        ))}
    </Card>
  )
}
