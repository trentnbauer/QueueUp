using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Controls;
using Playnite.SDK;
using Playnite.SDK.Data;
using Playnite.SDK.Plugins;

namespace QueueUpImporter
{
    public class GameEntry
    {
        public string title { get; set; }
        public int playtimeMinutes { get; set; }
    }

    public class ImportRequest
    {
        public List<GameEntry> games { get; set; }
    }

    public class ImportResult
    {
        public int totalReceived { get; set; }
        public int consideredCount { get; set; }
        public int imported { get; set; }
        public int skipped { get; set; }
    }

    public class QueueUpImporterPlugin : GenericPlugin
    {
        private static readonly ILogger logger = LogManager.GetLogger();
        private static readonly HttpClient httpClient = new HttpClient();

        public override Guid Id { get; } = Guid.Parse("a1e2f3a4-9c8b-4a3d-8f7e-2b6c1d4e5f60");

        public QueueUpImporterSettingsViewModel Settings { get; }

        public override string Name => "QueueUp Importer";

        public QueueUpImporterPlugin(IPlayniteAPI api) : base(api)
        {
            Settings = new QueueUpImporterSettingsViewModel(this);
            Properties = new GenericPluginProperties { HasSettings = true };
        }

        public override ISettings GetSettings(bool firstRunSettings) => Settings;

        public override UserControl GetSettingsView(bool firstRunSettings)
        {
            var view = new QueueUpImporterSettingsView();
            view.DataContext = Settings;
            return view;
        }

        public override IEnumerable<MainMenuItem> GetMainMenuItems(GetMainMenuItemsArgs args)
        {
            yield return new MainMenuItem
            {
                Description = "Sync library to QueueUp",
                MenuSection = "@QueueUp",
                Action = _ => SyncLibraryAsync(),
            };
        }

        private async void SyncLibraryAsync()
        {
            var serverUrl = (Settings.Settings.ServerUrl ?? string.Empty).TrimEnd('/');
            var token = Settings.Settings.ApiToken;
            if (string.IsNullOrWhiteSpace(serverUrl) || string.IsNullOrWhiteSpace(token))
            {
                PlayniteApi.Dialogs.ShowErrorMessage(
                    "Set your QueueUp server URL and API token in this extension's settings first.",
                    "QueueUp Importer");
                return;
            }

            // Playnite tracks Playtime in whole seconds; QueueUp's import endpoint takes minutes.
            var entries = PlayniteApi.Database.Games
                .Where(g => !string.IsNullOrWhiteSpace(g.Name))
                .Select(g => new GameEntry { title = g.Name, playtimeMinutes = (int)(g.Playtime / 60) })
                .ToList();

            if (entries.Count == 0)
            {
                PlayniteApi.Dialogs.ShowMessage("No games found in your Playnite library.", "QueueUp Importer");
                return;
            }

            try
            {
                var payload = Serialization.ToJson(new ImportRequest { games = entries });
                var request = new HttpRequestMessage(HttpMethod.Post, serverUrl + "/api/playnite/import")
                {
                    Content = new StringContent(payload, Encoding.UTF8, "application/json"),
                };
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await httpClient.SendAsync(request);
                var body = await response.Content.ReadAsStringAsync();
                if (!response.IsSuccessStatusCode)
                {
                    logger.Error($"QueueUp import failed ({(int)response.StatusCode}): {body}");
                    PlayniteApi.Dialogs.ShowErrorMessage($"QueueUp import failed: {body}", "QueueUp Importer");
                    return;
                }

                var result = Serialization.FromJson<ImportResult>(body);
                PlayniteApi.Dialogs.ShowMessage(
                    $"Added {result.imported} game(s) to QueueUp (skipped {result.skipped}, checked {result.consideredCount} of {result.totalReceived}).",
                    "QueueUp Importer");
            }
            catch (Exception ex)
            {
                logger.Error(ex, "QueueUp import failed");
                PlayniteApi.Dialogs.ShowErrorMessage($"Could not reach QueueUp: {ex.Message}", "QueueUp Importer");
            }
        }
    }
}
