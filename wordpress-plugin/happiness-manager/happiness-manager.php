<?php
/**
 * Plugin Name: Happiness Manager
 * Description: Save goals, journals, routines, and AI coaching notes inside WordPress.
 * Version: 0.1.10
 * Author: UmbrellaParade
 * Text Domain: happiness-manager
 * Update URI: https://github.com/UmbrellaParade/happiness-manager
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Happiness_Manager_Plugin {
    private const VERSION = '0.1.10';
    private const SLUG = 'happiness-manager';
    private const UPDATE_REPO = 'UmbrellaParade/happiness-manager';
    private const UPDATE_URI = 'https://github.com/UmbrellaParade/happiness-manager';
    private const UPDATE_ASSET = 'happiness-manager-wordpress-plugin.zip';
    private const UPDATE_CACHE_KEY = 'hm_github_latest_release';
    private const STATE_META_KEY = 'hm_state_v1';
    private const OPTION_FRONTEND_PAGE_ID = 'hm_frontend_page_id';
    private const OPTION_FRONTEND_PAGE_DISABLED = 'hm_frontend_page_disabled';
    private const OPTION_API_KEY = 'hm_openai_api_key';
    private const OPTION_MODEL = 'hm_openai_model';

    public static function boot(): void {
        add_action('init', [__CLASS__, 'register_journal_post_type']);
        add_action('admin_menu', [__CLASS__, 'register_admin_page']);
        add_action('admin_init', [__CLASS__, 'register_settings']);
        add_action('rest_api_init', [__CLASS__, 'register_rest_routes']);
        add_action('wp_enqueue_scripts', [__CLASS__, 'enqueue_frontend_assets']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_admin_assets']);
        add_action('admin_post_hm_create_frontend_page', [__CLASS__, 'handle_create_frontend_page']);
        add_action('wp_trash_post', [__CLASS__, 'mark_frontend_page_removed']);
        add_action('before_delete_post', [__CLASS__, 'mark_frontend_page_removed']);
        add_shortcode('happiness_manager', [__CLASS__, 'render_shortcode']);
        add_filter('pre_set_site_transient_update_plugins', [__CLASS__, 'check_for_updates']);
        add_filter('plugins_api', [__CLASS__, 'plugin_update_info'], 20, 3);
        register_activation_hook(__FILE__, [__CLASS__, 'activate']);
    }

    public static function activate(): void {
        add_option(self::OPTION_MODEL, 'gpt-5-mini', '', false);
        add_option(self::OPTION_API_KEY, '', '', false);
        self::ensure_frontend_page(true);
        self::register_journal_post_type();
        flush_rewrite_rules();
    }

    public static function register_journal_post_type(): void {
        register_post_type('hm_journal', [
            'labels' => [
                'name' => 'Happiness Journals',
                'singular_name' => 'Happiness Journal',
            ],
            'public' => false,
            'show_ui' => true,
            'show_in_menu' => false,
            'supports' => ['title', 'editor', 'author'],
            'capability_type' => 'post',
            'map_meta_cap' => true,
        ]);
    }

    public static function register_settings(): void {
        register_setting('hm_settings', self::OPTION_MODEL, [
            'type' => 'string',
            'sanitize_callback' => [__CLASS__, 'sanitize_model'],
            'default' => 'gpt-5-mini',
        ]);

        register_setting('hm_settings', self::OPTION_API_KEY, [
            'type' => 'string',
            'sanitize_callback' => [__CLASS__, 'sanitize_api_key'],
            'default' => '',
        ]);
    }

    public static function handle_create_frontend_page(): void {
        if (!current_user_can('publish_pages')) {
            wp_die(esc_html__('You do not have permission to create pages.', 'happiness-manager'));
        }

        check_admin_referer('hm_create_frontend_page');
        $page_id = self::ensure_frontend_page(true);
        $status = $page_id > 0 ? 'created' : 'failed';
        wp_safe_redirect(add_query_arg('hm_frontend_page', $status, admin_url('admin.php?page=happiness-manager')));
        exit;
    }

    public static function mark_frontend_page_removed($post_id): void {
        if ((int) $post_id !== (int) get_option(self::OPTION_FRONTEND_PAGE_ID, 0)) {
            return;
        }

        update_option(self::OPTION_FRONTEND_PAGE_DISABLED, '1', false);
        delete_option(self::OPTION_FRONTEND_PAGE_ID);
    }

    public static function sanitize_model($value): string {
        $value = sanitize_text_field((string) $value);
        return $value !== '' ? $value : 'gpt-5-mini';
    }

    public static function sanitize_api_key($value): string {
        $value = trim((string) $value);
        if ($value === '') {
            return (string) get_option(self::OPTION_API_KEY, '');
        }
        return sanitize_text_field($value);
    }

    public static function register_admin_page(): void {
        add_menu_page(
            'Happiness Manager',
            'Happiness Manager',
            'read',
            'happiness-manager',
            [__CLASS__, 'render_admin_page'],
            'dashicons-heart',
            58
        );
    }

    public static function register_assets(): void {
        wp_register_style(
            'happiness-manager-app',
            plugins_url('assets/app.css', __FILE__),
            [],
            self::VERSION
        );

        wp_register_script(
            'happiness-manager-app',
            plugins_url('assets/app.js', __FILE__),
            [],
            self::VERSION,
            true
        );
    }

    public static function enqueue_admin_assets(string $hook): void {
        self::register_assets();
        if ($hook === 'toplevel_page_happiness-manager') {
            self::enqueue_assets();
        }
    }

    public static function enqueue_frontend_assets(): void {
        self::register_assets();
        if (!self::current_page_has_shortcode()) {
            return;
        }

        wp_enqueue_style('happiness-manager-app');
        if (is_user_logged_in()) {
            wp_enqueue_script('happiness-manager-app');
            wp_localize_script('happiness-manager-app', 'HM_CONFIG', [
                'restUrl' => esc_url_raw(rest_url('happiness-manager/v1')),
                'nonce' => wp_create_nonce('wp_rest'),
                'userId' => get_current_user_id(),
                'model' => (string) get_option(self::OPTION_MODEL, 'gpt-5-mini'),
                'hasApiKey' => self::has_api_key(),
            ]);
        }
    }

    private static function current_page_has_shortcode(): bool {
        if (!is_singular()) {
            return false;
        }

        $post = get_post();
        return $post instanceof WP_Post && has_shortcode((string) $post->post_content, 'happiness_manager');
    }

    private static function enqueue_assets(): void {
        wp_enqueue_style('happiness-manager-app');
        wp_enqueue_script('happiness-manager-app');
        wp_localize_script('happiness-manager-app', 'HM_CONFIG', [
            'restUrl' => esc_url_raw(rest_url('happiness-manager/v1')),
            'nonce' => wp_create_nonce('wp_rest'),
            'userId' => get_current_user_id(),
            'model' => (string) get_option(self::OPTION_MODEL, 'gpt-5-mini'),
            'hasApiKey' => self::has_api_key(),
        ]);
    }

    private static function ensure_frontend_page(bool $force = false): int {
        if (!$force && get_option(self::OPTION_FRONTEND_PAGE_DISABLED, '') === '1') {
            return 0;
        }

        if ($force) {
            delete_option(self::OPTION_FRONTEND_PAGE_DISABLED);
        }

        $existing_page_id = self::find_frontend_page_id();
        if ($existing_page_id > 0) {
            return $existing_page_id;
        }

        $page_id = (int) get_option(self::OPTION_FRONTEND_PAGE_ID, 0);
        $page = $page_id > 0 ? get_post($page_id) : null;
        if ($page instanceof WP_Post && $page->post_status !== 'trash') {
            return $page_id;
        }

        $existing = get_page_by_path('happiness-manager');
        if ($existing instanceof WP_Post) {
            $page_id = (int) $existing->ID;
            if (!has_shortcode((string) $existing->post_content, 'happiness_manager')) {
                wp_update_post([
                    'ID' => $page_id,
                    'post_content' => trim((string) $existing->post_content) . "\n\n[happiness_manager view=\"journal\" mobile=\"1\"]",
                ]);
            }
            update_option(self::OPTION_FRONTEND_PAGE_ID, $page_id, false);
            return $page_id;
        }

        $page_id = wp_insert_post([
            'post_type' => 'page',
            'post_status' => 'publish',
            'post_title' => 'Happiness Manager',
            'post_name' => 'happiness-manager',
            'post_content' => '[happiness_manager view="journal" mobile="1"]',
            'post_author' => get_current_user_id() ?: 1,
        ]);

        if (!is_wp_error($page_id) && $page_id > 0) {
            update_option(self::OPTION_FRONTEND_PAGE_ID, (int) $page_id, false);
            return (int) $page_id;
        }

        return 0;
    }

    private static function find_frontend_page_id(): int {
        $page_id = (int) get_option(self::OPTION_FRONTEND_PAGE_ID, 0);
        $page = $page_id > 0 ? get_post($page_id) : null;
        if ($page instanceof WP_Post && $page->post_status !== 'trash') {
            return $page_id;
        }

        $existing = get_page_by_path('happiness-manager');
        if ($existing instanceof WP_Post && $existing->post_status !== 'trash' && has_shortcode((string) $existing->post_content, 'happiness_manager')) {
            update_option(self::OPTION_FRONTEND_PAGE_ID, (int) $existing->ID, false);
            return (int) $existing->ID;
        }

        return 0;
    }

    private static function frontend_page_url(): string {
        $page_id = self::find_frontend_page_id();
        if ($page_id > 0) {
            return (string) get_permalink($page_id);
        }

        return '';
    }

    public static function check_for_updates($transient) {
        if (!is_object($transient)) {
            return $transient;
        }

        if (empty($transient->checked)) {
            return $transient;
        }

        $release = self::get_latest_release();
        if (!$release || empty($release['package'])) {
            return $transient;
        }

        if (version_compare($release['version'], self::VERSION, '<=')) {
            return $transient;
        }

        $plugin_file = plugin_basename(__FILE__);
        if (!isset($transient->response) || !is_array($transient->response)) {
            $transient->response = [];
        }

        $transient->response[$plugin_file] = (object) [
            'id' => self::UPDATE_URI,
            'slug' => self::SLUG,
            'plugin' => $plugin_file,
            'new_version' => $release['version'],
            'url' => $release['html_url'],
            'package' => $release['package'],
            'tested' => '6.6',
            'requires' => '6.0',
            'requires_php' => '7.4',
        ];

        return $transient;
    }

    public static function plugin_update_info($result, string $action, $args) {
        if ($action !== 'plugin_information' || empty($args->slug) || $args->slug !== self::SLUG) {
            return $result;
        }

        $release = self::get_latest_release(true);
        if (!$release) {
            return $result;
        }

        return (object) [
            'name' => 'Happiness Manager',
            'slug' => self::SLUG,
            'version' => $release['version'],
            'author' => 'UmbrellaParade',
            'homepage' => self::UPDATE_URI,
            'requires' => '6.0',
            'tested' => '6.6',
            'requires_php' => '7.4',
            'download_link' => $release['package'],
            'sections' => [
                'description' => 'WordPressに日誌、目標、64分解、AI相談を保存する家族向けHappiness Managerプラグインです。',
                'changelog' => nl2br(esc_html($release['body'] !== '' ? $release['body'] : 'GitHub Releasesから配信される更新です。')),
            ],
        ];
    }

    private static function get_latest_release(bool $force = false): ?array {
        if (!$force) {
            $cached = get_site_transient(self::UPDATE_CACHE_KEY);
            if (is_array($cached)) {
                return $cached;
            }
        }

        $response = wp_remote_get('https://api.github.com/repos/' . self::UPDATE_REPO . '/releases/latest', [
            'headers' => [
                'Accept' => 'application/vnd.github+json',
                'User-Agent' => 'Happiness-Manager-WordPress-Updater',
            ],
            'timeout' => 15,
        ]);

        if (is_wp_error($response)) {
            return null;
        }

        if ((int) wp_remote_retrieve_response_code($response) !== 200) {
            return null;
        }

        $data = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($data) || empty($data['tag_name'])) {
            return null;
        }

        $package = '';
        foreach (($data['assets'] ?? []) as $asset) {
            if (!is_array($asset) || empty($asset['name']) || empty($asset['browser_download_url'])) {
                continue;
            }

            if ((string) $asset['name'] === self::UPDATE_ASSET) {
                $package = (string) $asset['browser_download_url'];
                break;
            }
        }

        if ($package === '') {
            return null;
        }

        $release = [
            'version' => self::normalize_release_version((string) $data['tag_name']),
            'tag' => (string) $data['tag_name'],
            'name' => (string) ($data['name'] ?? $data['tag_name']),
            'html_url' => (string) ($data['html_url'] ?? self::UPDATE_URI),
            'body' => (string) ($data['body'] ?? ''),
            'package' => $package,
            'published_at' => (string) ($data['published_at'] ?? ''),
        ];

        set_site_transient(self::UPDATE_CACHE_KEY, $release, 6 * HOUR_IN_SECONDS);
        return $release;
    }

    private static function normalize_release_version(string $tag): string {
        $tag = trim($tag);
        if ($tag !== '' && ($tag[0] === 'v' || $tag[0] === 'V')) {
            return substr($tag, 1);
        }
        return $tag;
    }

    public static function render_admin_page(): void {
        if (!current_user_can('read')) {
            wp_die(esc_html__('You do not have permission to access this page.', 'happiness-manager'));
        }

        $has_key = self::has_api_key();
        $frontend_url = self::frontend_page_url();
        $create_page_url = wp_nonce_url(admin_url('admin-post.php?action=hm_create_frontend_page'), 'hm_create_frontend_page');
        ?>
        <div class="wrap hm-admin-wrap">
            <h1>Happiness Manager</h1>

            <p>
                <?php if ($frontend_url !== '') : ?>
                    <a class="button button-primary" href="<?php echo esc_url($frontend_url); ?>" target="_blank" rel="noopener">スマホ用ページを開く</a>
                    <span class="description">サイト側で日誌を直接書けるページです。</span>
                <?php else : ?>
                    <a class="button button-primary" href="<?php echo esc_url($create_page_url); ?>">スマホ用ページを作成</a>
                    <span class="description">削除した固定ページは自動で復活しません。必要な場合だけ作成してください。</span>
                <?php endif; ?>
            </p>

            <details class="hm-settings-box">
                <summary>AI設定</summary>
                <form method="post" action="options.php" class="hm-settings-form">
                    <?php settings_fields('hm_settings'); ?>
                    <label>
                        <span>OpenAI APIキー</span>
                        <input type="password" name="<?php echo esc_attr(self::OPTION_API_KEY); ?>" value="" autocomplete="off" placeholder="<?php echo $has_key ? esc_attr__('設定済み。変更する場合のみ入力', 'happiness-manager') : esc_attr__('sk-...', 'happiness-manager'); ?>">
                    </label>
                    <label>
                        <span>モデル</span>
                        <input type="text" name="<?php echo esc_attr(self::OPTION_MODEL); ?>" value="<?php echo esc_attr((string) get_option(self::OPTION_MODEL, 'gpt-5-mini')); ?>">
                    </label>
                    <?php submit_button('AI設定を保存'); ?>
                </form>
            </details>

            <div data-hm-app data-initial-tab="goals" class="hm-app-root"></div>
        </div>
        <?php
    }

    public static function render_shortcode($atts = []): string {
        $atts = shortcode_atts([
            'view' => 'journal',
            'mobile' => '1',
        ], $atts, 'happiness_manager');

        self::register_assets();
        if (!wp_style_is('happiness-manager-app', 'enqueued')) {
            wp_enqueue_style('happiness-manager-app');
        }

        if (!is_user_logged_in()) {
            $redirect = get_permalink();
            if (!$redirect) {
                $redirect = home_url('/');
            }
            $login_url = wp_login_url($redirect);
            return '<div class="hm-login-message"><p>Happiness Managerを使うにはWordPressにログインしてください。</p><p><a class="button" href="' . esc_url($login_url) . '">ログインして日誌を書く</a></p></div>';
        }

        if (!wp_script_is('happiness-manager-app', 'enqueued')) {
            self::enqueue_assets();
        }
        $view = in_array($atts['view'], ['goals', 'board', 'journal', 'coach', 'backup'], true) ? $atts['view'] : 'journal';
        $mobile = $atts['mobile'] === '1' ? '1' : '0';
        return '<div data-hm-app data-initial-tab="' . esc_attr($view) . '" data-mobile-mode="' . esc_attr($mobile) . '" class="hm-app-root hm-frontend-app"></div>';
    }

    public static function register_rest_routes(): void {
        register_rest_route('happiness-manager/v1', '/state', [
            [
                'methods' => 'GET',
                'callback' => [__CLASS__, 'rest_get_state'],
                'permission_callback' => [__CLASS__, 'can_use_app'],
            ],
            [
                'methods' => 'POST',
                'callback' => [__CLASS__, 'rest_save_state'],
                'permission_callback' => [__CLASS__, 'can_use_app'],
            ],
        ]);

        register_rest_route('happiness-manager/v1', '/coach', [
            'methods' => 'POST',
            'callback' => [__CLASS__, 'rest_ai_coach'],
            'permission_callback' => [__CLASS__, 'can_use_app'],
        ]);
    }

    public static function can_use_app(): bool {
        return is_user_logged_in() && current_user_can('read');
    }

    public static function rest_get_state(WP_REST_Request $request): WP_REST_Response {
        $user_id = get_current_user_id();
        $state = get_user_meta($user_id, self::STATE_META_KEY, true);
        if (!is_array($state)) {
            $state = null;
        }

        return new WP_REST_Response([
            'state' => $state,
            'savedAt' => current_time('mysql'),
        ]);
    }

    public static function rest_save_state(WP_REST_Request $request) {
        $state = $request->get_param('state');
        if (!is_array($state)) {
            return new WP_Error('hm_invalid_state', 'state must be an object.', ['status' => 400]);
        }

        $encoded = wp_json_encode($state);
        if (!is_string($encoded) || strlen($encoded) > 2000000) {
            return new WP_Error('hm_state_too_large', 'Saved data is too large.', ['status' => 413]);
        }

        $user_id = get_current_user_id();
        update_user_meta($user_id, self::STATE_META_KEY, $state);
        self::sync_journal_posts($state, $user_id);

        return new WP_REST_Response([
            'ok' => true,
            'savedAt' => current_time('mysql'),
        ]);
    }

    public static function rest_ai_coach(WP_REST_Request $request) {
        $api_key = (string) get_option(self::OPTION_API_KEY, '');
        if ($api_key === '') {
            return new WP_Error('hm_missing_api_key', 'OpenAI APIキーが設定されていません。', ['status' => 400]);
        }

        $message = sanitize_textarea_field((string) $request->get_param('message'));
        $mode = sanitize_text_field((string) $request->get_param('mode'));
        $context = $request->get_param('context');
        if (!is_array($context)) {
            $context = [];
        }

        if ($message === '') {
            return new WP_Error('hm_empty_message', '相談内容を入力してください。', ['status' => 400]);
        }

        $prompt = self::build_ai_prompt_v2($mode, $message, $context);
        $body = [
            'model' => self::sanitize_model(get_option(self::OPTION_MODEL, 'gpt-5-mini')),
            'instructions' => self::ai_instructions_v2(),
            'input' => $prompt,
            'max_output_tokens' => 1200,
        ];

        $response = wp_remote_post('https://api.openai.com/v1/responses', [
            'headers' => [
                'Authorization' => 'Bearer ' . $api_key,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode($body),
            'timeout' => 45,
        ]);

        if (is_wp_error($response)) {
            return new WP_Error('hm_openai_request_failed', $response->get_error_message(), ['status' => 502]);
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $raw = (string) wp_remote_retrieve_body($response);
        $data = json_decode($raw, true);

        if ($status < 200 || $status >= 300) {
            $message = is_array($data) && isset($data['error']['message']) ? $data['error']['message'] : 'OpenAI API request failed.';
            return new WP_Error('hm_openai_error', $message, ['status' => $status]);
        }

        return new WP_REST_Response([
            'text' => self::extract_response_text(is_array($data) ? $data : []),
            'model' => $body['model'],
        ]);
    }

    private static function ai_instructions_v2(): string {
        return 'あなたはHappiness Managerの目標達成コーチです。ユーザー本人と家族の背景、価値観、目標、日誌、AIメモリを踏まえて、継続相談の相手として返答してください。診断や治療の断定は避け、必要な場合は専門家や信頼できる人に相談する表現にしてください。返答はやさしく、具体的に、次の一手が見える形にしてください。最後に必ず「## AI引き継ぎメモ」という見出しを置き、次回以降の相談で覚えておくべき要点を3〜6個の短い箇条書きで書いてください。';
    }

    private static function build_ai_prompt_v2(string $mode, string $message, array $context): string {
        $context_json = wp_json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($context_json)) {
            $context_json = '{}';
        }

        return "相談モード: {$mode}\n\n"
            . "ユーザーの相談:\n{$message}\n\n"
            . "Happiness Managerに保存されている継続相談用コンテキスト(JSON):\n{$context_json}\n\n"
            . "使い方:\n"
            . "- aiMemory.notes は、AIに覚えておいてほしい長期情報です。\n"
            . "- aiMemory.decisions は、本人が決めたこと・大事な前提です。\n"
            . "- aiMemory.handoff は、前回までのAI引き継ぎメモです。\n"
            . "- aiMemory.items は、項目ごとに保存した長期情報です。imageUrl がある場合、それはWordPressメディアなどの保存先URLです。このAPI呼び出しでは画像本体を入力画像として送っていないため、画像内容を見た前提で断定しないでください。\n"
            . "- aiMemory.history は、最近の相談履歴です。\n"
            . "- goal.plan は、長期目標、直近の目標、次の目標と日付、達成メモです。\n"
            . "- goal.themes は長期目標の64分解です。goal.boardVariants.recent と goal.boardVariants.next は直近/次の目標用の64分解です。\n"
            . "- 各64項目の subs は、8つに絞る前の候補や次の一手メモです。childThemes は、その項目をさらに64分解した下位64です。\n"
            . "- coachSelection は、ユーザーがAI相談画面で選んだ相談カテゴリと詳細項目です。その選択に強く焦点を当ててください。\n"
            . "- daily、journal、recentJournals は現在の状態・今日の日誌・最近の日誌です。\n\n"
            . "返答では、必要に応じて「深掘り質問」「4観点の候補」「64分解のテーマ候補」「明日の一手」を見出し付きで提案してください。"
            . "最後に必ず「## AI引き継ぎメモ」を出し、次回に引き継ぐ要点を書いてください。";
    }

    private static function ai_instructions(): string {
        return 'あなたはHappiness Managerの目標達成コーチです。本人の言葉を尊重し、原田メソッドに影響を受けた「目的、4観点、64分解、日誌」の整理を手伝います。医療・診断・治療の助言は避け、必要な時は専門家や信頼できる人へつなぐ表現にしてください。押しつけず、短く、具体的な質問と次の一手を返してください。';
    }

    private static function build_ai_prompt(string $mode, string $message, array $context): string {
        $context_json = wp_json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return "相談モード: {$mode}\n\nユーザーの相談:\n{$message}\n\n現在の入力内容(JSON):\n{$context_json}\n\n返答では、必要に応じて「深掘り質問」「4観点の候補」「64分解のテーマ候補」「明日の一手」を見出し付きで提案してください。";
    }

    private static function extract_response_text(array $data): string {
        if (isset($data['output_text']) && is_string($data['output_text'])) {
            return $data['output_text'];
        }

        $parts = [];
        foreach (($data['output'] ?? []) as $item) {
            foreach (($item['content'] ?? []) as $content) {
                if (isset($content['text']) && is_string($content['text'])) {
                    $parts[] = $content['text'];
                }
            }
        }

        return trim(implode("\n", $parts));
    }

    private static function has_api_key(): bool {
        return (string) get_option(self::OPTION_API_KEY, '') !== '';
    }

    private static function sync_journal_posts(array $state, int $user_id): void {
        if (empty($state['journals']) || !is_array($state['journals'])) {
            return;
        }

        $profiles = [];
        foreach (($state['profiles'] ?? []) as $profile) {
            if (is_array($profile) && isset($profile['id'])) {
                $profiles[(string) $profile['id']] = (string) ($profile['name'] ?? '');
            }
        }

        foreach ($state['journals'] as $key => $journal) {
            if (!is_array($journal) || !self::journal_has_content($journal)) {
                continue;
            }

            $parts = explode('|', (string) $key, 2);
            $profile_id = $parts[0] ?? '';
            $date = $parts[1] ?? '';
            $profile_name = $profiles[$profile_id] ?? $profile_id;
            $title = sprintf('Happiness Journal %s %s', $date, $profile_name);
            $content = self::journal_to_post_content($journal);
            $post_id = self::find_journal_post($user_id, (string) $key);

            $post_data = [
                'post_type' => 'hm_journal',
                'post_status' => 'private',
                'post_author' => $user_id,
                'post_title' => $title,
                'post_content' => $content,
            ];

            if ($post_id) {
                $post_data['ID'] = $post_id;
                wp_update_post(wp_slash($post_data));
            } else {
                $post_id = wp_insert_post(wp_slash($post_data));
            }

            if ($post_id && !is_wp_error($post_id)) {
                update_post_meta($post_id, '_hm_journal_key', (string) $key);
                update_post_meta($post_id, '_hm_journal_date', $date);
                update_post_meta($post_id, '_hm_profile_id', $profile_id);
                update_post_meta($post_id, '_hm_profile_name', $profile_name);
                update_post_meta($post_id, '_hm_journal_payload', $journal);
            }
        }
    }

    private static function journal_has_content(array $journal): bool {
        foreach ($journal as $value) {
            if (is_string($value) && trim($value) !== '') {
                return true;
            }
        }
        return false;
    }

    private static function journal_to_post_content(array $journal): string {
        $labels = [
            'best' => '今日できたこと',
            'learned' => '気づき・学び',
            'next' => '明日の一手',
            'gratitude' => '感謝',
            'selfTalk' => '自分への言葉',
            'memo' => 'メモ',
        ];

        $lines = [];
        foreach ($labels as $key => $label) {
            $value = isset($journal[$key]) ? trim((string) $journal[$key]) : '';
            if ($value !== '') {
                $lines[] = "## {$label}\n{$value}";
            }
        }

        return implode("\n\n", $lines);
    }

    private static function find_journal_post(int $user_id, string $journal_key): int {
        $posts = get_posts([
            'post_type' => 'hm_journal',
            'post_status' => 'private',
            'author' => $user_id,
            'fields' => 'ids',
            'posts_per_page' => 1,
            'meta_key' => '_hm_journal_key',
            'meta_value' => $journal_key,
        ]);

        return $posts ? (int) $posts[0] : 0;
    }
}

Happiness_Manager_Plugin::boot();
