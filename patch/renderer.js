
RendererEvents.onSettingsWindowCreated(async () => {
    const view = await PluginSettings.renderer.registerPluginSettings(__self.meta.packageJson);
    await onSettingWindowCreated(view);
});
