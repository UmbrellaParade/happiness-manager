<?php
/**
 * Plugin Name: Happiness Manager
 * Description: Save goals, journals, routines, and AI coaching notes inside WordPress.
 * Version: 0.1.0
 * Author: UmbrellaParade
 * Text Domain: happiness-manager
 */

if (!defined('ABSPATH')) {
    exit;
}

final class Happiness_Manager_Plugin {
    private const VERSION = '0.1.0';
    private const STATE_META_KEY = 'hm_state_v1';
    private const OPTION_API_KEY = 'hm_openai_api_key';
    private const OPTION_MODEL = 'hm_openai_model';

    public static function boot(): void {
        add_action('init', [__CLASS__, 'register_journal_post_type']);
        add_action('admin_menu', [__CLASS__, 'register_admin_page']);
        add_action('admin_init', [__CLASS__, 'register_settings']);
        add_action('rest_api_init', [__CLASS__, 'register_rest_routes']);
        add_action('wp_enqueue_scripts', [__CLASS__, 'enqueue_frontend_assets']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_admin_assets']);
        add_shortcode('happiness_manager', [__CLASS__, 'render_shortcode']);
        register_activation_hook(__FILE__, [__CLASS__, 'activate']);
    }

    public static function activate(): void {
        add_option(self::OPTION_MODEL, 'gpt-5-mini', '', false);
        add_option(self::OPTION_API_KEY, '', '', false);
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
        if (is_user_logged_in()) {
            self::enqueue_assets();
        }
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

    public static function render_admin_page(): void {
        if (!current_user_can('read')) {
            wp_die(esc_html__('You do not have permission to access this page.', 'happiness-manager'));
        }

        $has_key = self::has_api_key();
        ?>
        <div class="wrap hm-admin-wrap">
            <h1>Happiness Manager</h1>

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

            <div data-hm-app class="hm-app-root"></div>
        </div>
        <?php
    }

    public static function render_shortcode(): string {
        if (!is_user_logged_in()) {
            return '<p>Happiness Managerを使うにはWordPressにログインしてください。</p>';
        }

        self::enqueue_assets();
        return '<div data-hm-app class="hm-app-root"></div>';
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

        $prompt = self::build_ai_prompt($mode, $message, $context);
        $body = [
            'model' => self::sanitize_model(get_option(self::OPTION_MODEL, 'gpt-5-mini')),
            'instructions' => self::ai_instructions(),
            'input' => $prompt,
            'max_output_tokens' => 900,
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
