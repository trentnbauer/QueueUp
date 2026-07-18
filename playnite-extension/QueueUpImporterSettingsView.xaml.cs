using System.Windows.Controls;

namespace QueueUpImporter
{
    public partial class QueueUpImporterSettingsView : UserControl
    {
        public QueueUpImporterSettingsView()
        {
            InitializeComponent();
            // WPF's PasswordBox deliberately has no bindable Password property (it isn't kept in
            // memory as plain text on purpose) - so the token round-trips through code-behind
            // instead of XAML binding, both to pre-fill from the loaded settings on open and to
            // push edits back as the user types.
            DataContextChanged += (s, e) =>
            {
                if (DataContext is QueueUpImporterSettingsViewModel vm)
                {
                    ApiTokenBox.Password = vm.Settings.ApiToken;
                }
            };
        }

        private void ApiTokenBox_PasswordChanged(object sender, System.Windows.RoutedEventArgs e)
        {
            if (DataContext is QueueUpImporterSettingsViewModel vm)
            {
                vm.Settings.ApiToken = ApiTokenBox.Password;
            }
        }
    }
}
