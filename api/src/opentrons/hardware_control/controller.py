import asyncio
import os
import fcntl
import threading
from typing import Any, Dict, List, Optional, Tuple
from opentrons.util import environment
from opentrons.drivers.smoothie_drivers import driver_3_0
from opentrons.config import robot_configs
from opentrons.types import Mount
from contextlib import contextmanager
from . import modules


_lock = threading.Lock()


class _Locker:
    """ A class that combines a threading.Lock and a file lock to ensure
    controllers are unique both between processes and within a process.

    There should be one instance of this per process.
    """
    LOCK_FILE_PATH = environment.settings['HARDWARE_CONTROLLER_LOCKFILE']

    def __init__(self):
        global _lock

        self._thread_lock_acquired = _lock.acquire(blocking=False)
        self._file_lock_acquired = self._try_acquire_file_lock()
        if not (self._thread_lock_acquired and self._file_lock_acquired):
            raise RuntimeError(
                'Only one hardware controller may be instantiated')

    def _try_acquire_file_lock(self):
        self._file = open(self.LOCK_FILE_PATH, 'w')
        try:
            fcntl.lockf(self._file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return False
        else:
            return True

    def __del__(self):
        global _lock
        if self._file_lock_acquired:
            fcntl.lockf(self._file, fcntl.LOCK_UN)
        if self._thread_lock_acquired:
            _lock.release()


class Controller:
    """ The concrete instance of the controller for actually controlling
    hardware.

    This class may only be instantiated on a robot, and only one instance
    may be active at any time.
    """

    def __init__(self, config, loop):
        """ Build a Controller instance.

        If another controller is already instantiated on the system (or if
        this is instantiated somewhere other than a robot) then this method
        will raise a RuntimeError.
        """
        if not os.environ.get('RUNNING_ON_PI'):
            raise RuntimeError('{} may only be instantiated on a robot'
                               .format(self.__class__.__name__))
        self._lock = _Locker()
        self.config = config or robot_configs.load()
        self._smoothie_driver = driver_3_0.SmoothieDriver_3_0_0(
            config=self.config)
        self._attached_modules = {}

    def move(self, target_position: Dict[str, float],
             home_flagged_axes: bool = True, speed: float = None):
        with self._set_temp_speed(speed):
            self._smoothie_driver.move(
                target_position, home_flagged_axes=home_flagged_axes)

    def home(self, axes: List[str] = None) -> Dict[str, float]:
        if axes:
            args: Tuple[Any, ...] = (''.join(axes),)
        else:
            args = tuple()
        return self._smoothie_driver.home(*args)

    def fast_home(self, axis: str, margin: float) -> Dict[str, float]:
        return self._smoothie_driver.fast_home(axis, margin)

    def get_attached_instruments(
            self, expected: Dict[Mount, str])\
            -> Dict[Mount, Dict[str, Optional[str]]]:
        """ Find the instruments attached to our mounts.

        :param expected: A dict that may contain a mapping from mount to
                         strings that should prefix instrument model names.
                         When instruments are scanned, they are matched
                         against the expectation (if present) and a
                         :py:attr:`RuntimeError` is raised if there is no
                         match.

        :raises RuntimeError: If an instrument is expected but not found.
        :returns: A dict with mounts as the top-level keys. Each mount value is
            a dict with keys 'mount' (containing an instrument model name or
            `None`) and 'id' (containing the serial number of the pipette
            attached to that mount, or `None`).
        """
        to_return: Dict[Mount, Dict[str, Optional[str]]] = {}
        for mount in Mount:
            found_model = self._smoothie_driver.read_pipette_model(
                mount.name.lower())
            found_id = self._smoothie_driver.read_pipette_id(
                mount.name.lower())
            expected_instr = expected.get(mount, None)
            if expected_instr and\
               (not found_model or not found_model.startswith(expected_instr)):
                raise RuntimeError(
                    'mount {}: expected instrument {} but got {}'
                    .format(mount.name, expected_instr, found_model))
            to_return[mount] = {
                'model': found_model,
                'id': found_id}
        return to_return

    def set_active_current(self, axis, amp):
        """
        This method sets only the 'active' current, i.e., the current for an
        axis' movement. Smoothie driver automatically resets the current for
        pipette axis to a low current (dwelling current) after each move
        """
        self._smoothie_driver.set_active_current({axis.name: amp})

    @contextmanager
    def save_current(self):
        self._smoothie_driver.push_active_current()
        try:
            yield
        finally:
            self._smoothie_driver.pop_active_current()

    def set_pipette_speed(self, val: float):
        self._smoothie_driver.set_speed(val)

    def get_attached_modules(self) -> List[Tuple[str, str]]:
        return modules.discover()

    def build_module(self, port: str, model: str) -> modules.AbstractModule:
        return modules.build(port, model, False)

    async def update_module(
            self,
            module: modules.AbstractModule,
            firmware_file: str,
            loop: Optional[asyncio.AbstractEventLoop])\
            -> modules.AbstractModule:
        return await modules.update_firmware(
            module, firmware_file, loop)

    def _connect(self):
        self._smoothie_driver.connect()

    @contextmanager
    def _set_temp_speed(self, speed):
        if not speed:
            yield
        else:
            self._smoothie_driver.push_speed()
            self._smoothie_driver.set_speed(speed)
            try:
                yield
            finally:
                self._smoothie_driver.pop_speed()