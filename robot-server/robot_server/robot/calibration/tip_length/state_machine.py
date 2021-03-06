from typing import Dict
from robot_server.service.session.models import CommandDefinition, \
    TipLengthCalibrationCommand as TipCalCommand, CalibrationCommand
from robot_server.robot.calibration.tip_length.util import (
    SimpleStateMachine,
    StateTransitionError
)
from robot_server.robot.calibration.tip_length.constants import (
    TipCalibrationState as State,
)


TIP_LENGTH_TRANSITIONS: Dict[State, Dict[CommandDefinition, State]] = {
    State.sessionStarted: {
        CalibrationCommand.load_labware: State.labwareLoaded
    },
    State.labwareLoaded: {
        TipCalCommand.move_to_reference_point: State.measuringNozzleOffset
    },
    State.measuringNozzleOffset: {
        CalibrationCommand.save_offset: State.measuringNozzleOffset,
        CalibrationCommand.jog: State.measuringNozzleOffset,
        TipCalCommand.move_to_tip_rack: State.preparingPipette
    },
    State.preparingPipette: {
        CalibrationCommand.jog: State.preparingPipette,
        CalibrationCommand.pick_up_tip: State.preparingPipette,
        CalibrationCommand.invalidate_tip: State.preparingPipette,
        TipCalCommand.move_to_reference_point: State.measuringTipOffset,
        TipCalCommand.move_to_tip_rack: State.preparingPipette
    },
    State.measuringTipOffset: {
        CalibrationCommand.save_offset: State.measuringTipOffset,
        CalibrationCommand.jog: State.measuringTipOffset,
        TipCalCommand.move_to_tip_rack: State.calibrationComplete
    },
    State.WILDCARD: {
        CalibrationCommand.exit: State.sessionExited
    }
}


class TipCalibrationStateMachine:
    def __init__(self):
        self._state_machine = SimpleStateMachine(
            states=set(s for s in State),
            transitions=TIP_LENGTH_TRANSITIONS
        )

    def get_next_state(self, from_state: State, command: CommandDefinition):
        next_state = self._state_machine.get_next_state(from_state, command)
        if next_state:
            return next_state
        else:
            raise StateTransitionError(f"Cannot call {command} command "
                                       f"from {from_state}.")
