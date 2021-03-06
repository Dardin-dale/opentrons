import importlib
import json
import os
import sys
from pathlib import Path
import logging
import asyncio
import re
from typing import List, Tuple
from opentrons.hardware_control import API, ThreadManager
from opentrons.config import (feature_flags as ff, name,
                              robot_configs, IS_ROBOT, ROBOT_FIRMWARE_DIR)
from opentrons.util import logging_config

version = sys.version_info[0:2]
if version < (3, 7):
    raise RuntimeError(
        'opentrons requires Python 3.7 or above, this is {0}.{1}'.format(
            version[0], version[1]))

HERE = os.path.abspath(os.path.dirname(__file__))

try:
    with open(os.path.join(HERE, 'package.json')) as pkg:
        package_json = json.load(pkg)
        __version__ = package_json.get('version')
except (FileNotFoundError, OSError):
    __version__ = 'unknown'

from opentrons import config  # noqa(E402)

LEGACY_MODULES = [
    'robot', 'reset', 'instruments', 'containers', 'labware', 'modules']

__all__ = ['version', 'HERE', 'LEGACY_MODULES', 'config']


def __getattr__(attrname):
    """
    Lazily load the robot singleton and friends to make importing faster

    The first time somebody does opentrons.robot (or any other v1 "module"
    that is actually a singleton), this will fire because the attr doesn't
    exist, and we'll import and initialize all the singletons. Subsequently
    this function won't be invoked.
    """
    if attrname in LEGACY_MODULES:
        legacy_api = importlib.import_module(
            '.'.join([__name__,
                      'legacy_api',
                      'api']))
        for mod in LEGACY_MODULES:
            setattr(sys.modules[__name__], attrname,
                    getattr(legacy_api, attrname))
        return getattr(sys.modules[__name__], attrname)
    raise AttributeError(attrname)


def __dir__():
    return sorted(__all__ + LEGACY_MODULES)


try:
    from opentrons.hardware_control.socket_server\
        import run as install_hardware_server
except ImportError:
    async def install_hardware_server(sock_path, api):  # type: ignore
        log.warning("Cannot start hardware server: missing dependency")


log = logging.getLogger(__name__)

try:
    import systemd.daemon  # type: ignore
except ImportError:
    log.info("Systemd couldn't be imported, not notifying")

SMOOTHIE_HEX_RE = re.compile('smoothie-(.*).hex')


def _find_smoothie_file() -> Tuple[Path, str]:
    resources: List[Path] = []

    # Search for smoothie files in /usr/lib/firmware first then fall back to
    # value packed in wheel
    if IS_ROBOT:
        resources.extend(ROBOT_FIRMWARE_DIR.iterdir())  # type: ignore

    resources_path = Path(HERE) / 'resources'
    resources.extend(resources_path.iterdir())

    for path in resources:
        matches = SMOOTHIE_HEX_RE.search(path.name)
        if matches:
            branch_plus_ref = matches.group(1)
            return path, branch_plus_ref
    raise OSError(f"Could not find smoothie firmware file in {resources_path}")


async def initialize_robot() -> ThreadManager:
    if os.environ.get("ENABLE_VIRTUAL_SMOOTHIE"):
        log.info("Initialized robot using virtual Smoothie")
        return ThreadManager(API.build_hardware_simulator)
    packed_smoothie_fw_file, packed_smoothie_fw_ver = _find_smoothie_file()
    systemd.daemon.notify("READY=1")
    hardware = ThreadManager(API.build_hardware_controller,
                             threadmanager_nonblocking=True,
                             firmware=(packed_smoothie_fw_file,
                                       packed_smoothie_fw_ver))
    try:
        await hardware.managed_thread_ready_async()
    except RuntimeError:
        log.exception(
            'Could not build hardware controller, forcing virtual')
        return ThreadManager(API.build_hardware_simulator)

    loop = asyncio.get_event_loop()

    async def blink():
        while True:
            await hardware.set_lights(button=True)
            await asyncio.sleep(0.5)
            await hardware.set_lights(button=False)
            await asyncio.sleep(0.5)

    blink_task = loop.create_task(blink())

    if not ff.disable_home_on_boot():
        log.info("Homing Z axes")
        await hardware.home_z()

    blink_task.cancel()
    await hardware.set_lights(button=True)

    return hardware


def initialize(
        hardware_server: bool = False,
        hardware_server_socket: str = None) \
        -> ThreadManager:
    """
    Initialize the Opentrons hardware returning a hardware instance.

    :param hardware_server: Run a jsonrpc server allowing rpc to the  hardware
     controller. Only works on buildroot because extra dependencies are
     required.
    :param hardware_server_socket: Override for the hardware server socket
    """
    checked_socket = hardware_server_socket\
        or "/var/run/opentrons-hardware.sock"
    robot_conf = robot_configs.load()
    logging_config.log_init(robot_conf.log_level)

    log.info(f"API server version:  {__version__}")
    log.info(f"Robot Name: {name()}")

    loop = asyncio.get_event_loop()
    hardware = loop.run_until_complete(initialize_robot())

    if hardware_server:
        #  TODO: BC 2020-02-25 adapt hardware socket server to ThreadManager
        loop.run_until_complete(
                install_hardware_server(checked_socket,
                                        hardware))  # type: ignore

    return hardware
