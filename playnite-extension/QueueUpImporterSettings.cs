using System.Collections.Generic;
using Playnite.SDK;
using Playnite.SDK.Data;

namespace QueueUpImporter
{
    public class QueueUpImporterSettings : ObservableObject
    {
        private string serverUrl = string.Empty;
        private string apiToken = string.Empty;

        // Base URL of the user's own QueueUp instance (e.g. https://queueup.example.com) - this is
        // self-hosted software with no fixed hostname, so it has to be configured per-install rather
        // than hardcoded.
        public string ServerUrl { get => serverUrl; set => SetValue(ref serverUrl, value); }

        // Pasted from QueueUp's Profile Settings ("Playnite import" section). Stored via Playnite's
        // own plugin settings persistence (see QueueUpImporterSettingsViewModel below) - Playnite
        // encrypts nothing extra for plugin settings, so treat this file the same as any other local
        // credential store on the machine.
        public string ApiToken { get => apiToken; set => SetValue(ref apiToken, value); }
    }

    public class QueueUpImporterSettingsViewModel : ObservableObject, ISettings
    {
        private readonly QueueUpImporterPlugin plugin;
        private QueueUpImporterSettings editingClone;

        public QueueUpImporterSettings Settings { get; set; }

        public QueueUpImporterSettingsViewModel(QueueUpImporterPlugin plugin)
        {
            this.plugin = plugin;
            var saved = plugin.LoadPluginSettings<QueueUpImporterSettings>();
            Settings = saved ?? new QueueUpImporterSettings();
        }

        public void BeginEdit()
        {
            editingClone = Serialization.GetClone(Settings);
        }

        public void CancelEdit()
        {
            Settings = editingClone;
        }

        public void EndEdit()
        {
            plugin.SavePluginSettings(Settings);
        }

        public bool VerifySettings(out List<string> errors)
        {
            errors = new List<string>();
            if (string.IsNullOrWhiteSpace(Settings.ServerUrl))
            {
                errors.Add("QueueUp server URL is required.");
            }
            if (string.IsNullOrWhiteSpace(Settings.ApiToken))
            {
                errors.Add("QueueUp API token is required - generate one in QueueUp's Profile Settings.");
            }
            return errors.Count == 0;
        }
    }
}
