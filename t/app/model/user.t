use strict;
use warnings;

use Test::More;

use FixMyStreet::TestMech;
use FixMyStreet::DB;

my $mech = FixMyStreet::TestMech->new();
$mech->log_in_ok('test@example.com');

my ($problem) = $mech->create_problems_for_body(1, '2504', 'Title', { anonymous => 'f' });
is $problem->user->latest_anonymity, 0, "User's last report was not anonymous";

FixMyStreet::override_config {
    ALLOWED_COBRANDS => [ { fixmystreet => '.' } ],
    MAPIT_URL => 'http://mapit.mysociety.org/',
}, sub {
    $mech->get_ok('/around?pc=sw1a1aa');
    $mech->follow_link_ok( { text_regex => qr/skip this step/i, }, "follow 'skip this step' link" );
    $mech->content_like(qr/may_show_name[^>]*checked/);
};

($problem) = $mech->create_problems_for_body(1, '2504', 'Title', { anonymous => 't' });
is $problem->user->latest_anonymity, 1, "User's last report was anonymous";

create_update($problem, anonymous => 'f');
is $problem->user->latest_anonymity, 0, "User's last update was not anonyous";

create_update($problem, anonymous => 't');
is $problem->user->latest_anonymity, 1, "User's last update was anonymous";

my $user = $problem->user;
my $body = $mech->create_body_ok(2237, 'Oxfordshire');
$user->update({ from_body => $body });

is $user->is_inspector, 0, "User is not inspector by default";

$user->user_body_permissions->find_or_create({
    body => $body,
    permission_type => 'planned_reports',
});

$user->discard_changes;

is $user->is_inspector, 1, "is_inspector returns 1 for user with planned_reports permissions";

FixMyStreet::override_config {
    ALLOWED_COBRANDS => [ { fixmystreet => '.' } ],
    MAPIT_URL => 'http://mapit.mysociety.org/',
}, sub {
    $mech->get_ok('/around?pc=sw1a1aa');
    $mech->follow_link_ok( { text_regex => qr/skip this step/i, }, "follow 'skip this step' link" );
    $mech->content_like(qr/may_show_name[^>c]*>/);
};

END {
    $mech->delete_user( $problem->user ) if $problem;
    done_testing();
}

sub create_update {
    my ($problem, %params) = @_;
    my $dt = DateTime->now()->add(days => 1);
    return FixMyStreet::App->model('DB::Comment')->find_or_create({
        problem_id => $problem->id,
        user_id => $problem->user_id,
        name => 'Other User',
        mark_fixed => 'false',
        text => 'This is some update text',
        state => 'confirmed',
        anonymous => 'f',
        created => $dt->ymd . ' ' . $dt->hms,
        %params,
    });
}
