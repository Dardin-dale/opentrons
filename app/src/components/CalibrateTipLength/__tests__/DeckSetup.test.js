// @flow
import * as React from 'react'
import { mount } from 'enzyme'
import { act } from 'react-dom/test-utils'
import { mockTipLengthCalibrationSessionDetails } from '../../../sessions/__fixtures__'
import * as Sessions from '../../../sessions'

import { DeckSetup } from '../DeckSetup'

jest.mock('../../../getLabware')

jest.mock('@opentrons/components/src/deck/RobotWorkSpace', () => ({
  RobotWorkSpace: () => <></>,
}))

describe('DeckSetup', () => {
  let render

  const mockSendCommand = jest.fn()
  const mockDeleteSession = jest.fn()

  beforeEach(() => {
    render = (props: $Shape<React.ElementProps<typeof DeckSetup>> = {}) => {
      const {
        hasBlock = true,
        instrument = mockTipLengthCalibrationSessionDetails.instrument,
        labware = mockTipLengthCalibrationSessionDetails.labware,
        sendSessionCommand = mockSendCommand,
        deleteSession = mockDeleteSession,
      } = props
      return mount(
        <DeckSetup
          hasBlock={hasBlock}
          labware={labware}
          instrument={instrument}
          sendSessionCommand={sendSessionCommand}
          deleteSession={deleteSession}
        />
      )
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('clicking continue proceeds to next step', () => {
    const wrapper = render()

    act(() => wrapper.find('button').invoke('onClick')())
    wrapper.update()

    expect(mockSendCommand).toHaveBeenCalledWith(
      Sessions.tipCalCommands.MOVE_TO_REFERENCE_POINT
    )
  })
})
