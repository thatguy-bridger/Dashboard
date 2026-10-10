# Home Assistant on an always-on Windows laptop (lid closed)

Runs Home Assistant OS in a VirtualBox VM with a **bridged** network adapter, so it gets its own address on your LAN
(this is what lets it discover Nest/Cast speakers). A scheduled task starts it at boot even when nobody is signed in.

1. **Virtualization on?** Task Manager > Performance > CPU > "Virtualization: Enabled". If not, enable Intel VT-x / AMD-V in the BIOS.
2. Install **VirtualBox** (virtualbox.org). If your Windows build has Hyper-V / "Virtual Machine Platform" turned on, VirtualBox still works but slower; turning them off is better.
3. Download the **VirtualBox (.vdi)** Home Assistant OS image from home-assistant.io/installation (Alternative > Windows).
4. VirtualBox: New VM > Type Linux / Other Linux (64-bit) > use the .vdi as the existing disk. 2 vCPU, 4 GB RAM.
   Settings > System > tick **Enable EFI**. Settings > Network > **Attached to: Bridged Adapter**, pick the laptop's **Ethernet** adapter.
   Name the VM `HomeAssistant`. Start it once and wait about 5 minutes.
5. From another device open `http://homeassistant.local:8123` and create your account.
6. In an Administrator PowerShell on the laptop: `powershell -ExecutionPolicy Bypass -File setup.ps1`.
7. Reboot the laptop once and confirm Home Assistant comes back by itself without anyone signing in.
